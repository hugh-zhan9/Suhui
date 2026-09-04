import type { TranslationSchema } from "@suhui/database/schemas/types"
import { TranslationService } from "@suhui/database/services/translation"
import type { SupportedActionLanguage } from "@suhui/shared"
import {
  TRANSLATION_PROGRESS_CHANNEL,
  type EntryTranslationProgress,
  type GeneratedEntryTranslation,
  type TranslateTextResult,
} from "@suhui/shared/translation"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import type { EntryTranslation } from "./types"
import { translationFields } from "./types"

type TranslationModel = Omit<TranslationSchema, "createdAt">
interface TranslationState {
  data: Record<string, Partial<Record<SupportedActionLanguage, EntryTranslation>>>
  progress: Record<string, Partial<Record<SupportedActionLanguage, TranslationProgressState>>>
}
export interface TranslationProgressState {
  requestId: string
  status: "translating" | "partial" | "complete" | "error"
  completedBatches: number
  totalBatches: number
  error?: string
}
const defaultState: TranslationState = {
  data: {},
  progress: {},
}

export const useTranslationStore = createZustandStore<TranslationState>("translation")(
  () => defaultState,
)

const get = useTranslationStore.getState
const set = useTranslationStore.setState
const immerSet = createImmerSetter(useTranslationStore)

class TranslationActions implements Hydratable, Resetable {
  async hydrate() {
    // Persisted rows are validated against provider and source fingerprints in main
    // before they are exposed to this session.
    translationActions.clearInSession()
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => TranslationService.purgeAllForMaintenance())

    await tx.run()
  }

  clearInSession() {
    set(defaultState)
  }

  removeInSession(entryId: string, language: SupportedActionLanguage) {
    immerSet((state) => {
      const translations = state.data[entryId]
      if (!translations) return
      delete translations[language]
      if (Object.keys(translations).length === 0) delete state.data[entryId]
    })
  }

  upsertManyInSession(translations: TranslationModel[]) {
    immerSet((state) => {
      translations.forEach((translation) => {
        if (!state.data[translation.entryId]) {
          state.data[translation.entryId] = {}
        }

        if (!state.data[translation.entryId]![translation.language]) {
          state.data[translation.entryId]![translation.language] = {
            title: null,
            description: null,
            content: null,
            readabilityContent: null,
          }
        }

        translationFields.forEach((field) => {
          if (translation[field]) {
            state.data[translation.entryId]![translation.language]![field] = translation[field]
          }
        })
      })
    })
  }

  async upsertMany(translations: TranslationModel[]) {
    this.upsertManyInSession(translations)

    await Promise.all(
      translations.map((translation) => TranslationService.insertTranslation(translation)),
    )
  }

  getTranslation(entryId: string, language: SupportedActionLanguage) {
    return get().data[entryId]?.[language]
  }

  setProgress(
    entryId: string,
    language: SupportedActionLanguage,
    progress: TranslationProgressState,
  ) {
    immerSet((state) => {
      state.progress[entryId] ??= {}
      state.progress[entryId]![language] = progress
    })
  }

  getProgress(entryId: string, language: SupportedActionLanguage) {
    return get().progress[entryId]?.[language]
  }
}

export const translationActions = new TranslationActions()

class TranslationSyncService {
  async translateText(params: {
    text: string
    language: SupportedActionLanguage
  }): Promise<TranslateTextResult> {
    if (typeof window === "undefined" || !(window as any).electron?.ipcRenderer) {
      throw new Error("翻译功能仅在桌面应用中可用")
    }
    if (!params.text.trim()) throw new Error("待翻译文本不能为空")
    return (await (window as any).electron.ipcRenderer.invoke(
      "translation.translateText",
      params,
    )) as TranslateTextResult
  }

  async generateTranslation(params: {
    entryId: string
    language: SupportedActionLanguage
    withContent?: boolean
    target: "content" | "readabilityContent"
  }): Promise<GeneratedEntryTranslation> {
    if (typeof window === "undefined" || !(window as any).electron?.ipcRenderer) {
      throw new Error("翻译功能仅在桌面应用中可用")
    }
    const requestId = globalThis.crypto.randomUUID()
    const ipcRenderer = (window as any).electron.ipcRenderer
    translationActions.setProgress(params.entryId, params.language, {
      requestId,
      status: "translating",
      completedBatches: 0,
      totalBatches: 0,
    })
    const dispose = ipcRenderer.on(
      TRANSLATION_PROGRESS_CHANNEL,
      (_event: unknown, progress: EntryTranslationProgress) => {
        const current = translationActions.getProgress(params.entryId, params.language)
        if (
          !progress ||
          current?.requestId !== requestId ||
          progress.requestId !== requestId ||
          progress.entryId !== params.entryId ||
          progress.language !== params.language ||
          !Number.isInteger(progress.completedBatches) ||
          !Number.isInteger(progress.totalBatches) ||
          progress.completedBatches < 0 ||
          progress.completedBatches > progress.totalBatches ||
          progress.completedBatches < current.completedBatches ||
          (current.totalBatches > 0 && progress.totalBatches !== current.totalBatches) ||
          progress.translation?.entryId !== params.entryId ||
          progress.translation?.language !== params.language
        ) {
          return
        }
        translationActions.upsertManyInSession([progress.translation])
        translationActions.setProgress(params.entryId, params.language, {
          requestId,
          status: "partial",
          completedBatches: progress.completedBatches,
          totalBatches: progress.totalBatches,
        })
      },
    )
    try {
      const result = (await ipcRenderer.invoke("translation.generate", {
        ...params,
        requestId,
      })) as GeneratedEntryTranslation
      const current = translationActions.getProgress(params.entryId, params.language)
      if (current?.requestId === requestId) {
        translationActions.upsertManyInSession([result])
        translationActions.setProgress(params.entryId, params.language, {
          requestId,
          status: "complete",
          completedBatches: current.totalBatches,
          totalBatches: current.totalBatches,
        })
      }
      return result
    } catch (error) {
      const current = translationActions.getProgress(params.entryId, params.language)
      if (current?.requestId === requestId) {
        translationActions.setProgress(params.entryId, params.language, {
          requestId,
          status: "error",
          completedBatches: current.completedBatches,
          totalBatches: current.totalBatches,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      throw error
    } finally {
      dispose()
    }
  }
}

export const translationSyncService = new TranslationSyncService()
