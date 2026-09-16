import type { TranslationSchema } from "@suhui/database/schemas/types"
import { TranslationService } from "@suhui/database/services/translation"
import type { SupportedActionLanguage } from "@suhui/shared"
import type {
  EntryTranslationProgress,
  GeneratedEntryTranslation,
  TranslateTextResult,
  TranslationBatchState,
} from "@suhui/shared/translation"
import { TRANSLATION_PROGRESS_CHANNEL } from "@suhui/shared/translation"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import type { EntryTranslation, TranslationField } from "./types"
import { translationFields } from "./types"

type TranslationModel = Omit<TranslationSchema, "createdAt">
interface TranslationState {
  data: Record<string, Partial<Record<SupportedActionLanguage, EntryTranslation>>>
  progress: Record<string, Partial<Record<SupportedActionLanguage, TranslationProgressState>>>
  metadataProgress: Record<
    string,
    Partial<Record<SupportedActionLanguage, TranslationProgressState>>
  >
  sourceRevisions: Record<string, Partial<Record<SupportedActionLanguage, string>>>
}
export interface TranslationProgressState {
  requestId: string
  status: "translating" | "partial" | "complete" | "incomplete" | "error"
  batchState?: TranslationBatchState
  retryingBatchId?: string
  completedBatches: number
  totalBatches: number
  error?: string
}
const defaultState: TranslationState = {
  data: {},
  progress: {},
  metadataProgress: {},
  sourceRevisions: {},
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

  prepareInSession(entryId: string, language: SupportedActionLanguage, sourceRevision: string) {
    immerSet((state) => {
      if (state.sourceRevisions[entryId]?.[language] === sourceRevision) return
      // A source change invalidates both scopes and their late responses; a
      // second observer of the same source must leave the other scope intact.
      if (state.data[entryId]) delete state.data[entryId]![language]
      if (state.progress[entryId]) delete state.progress[entryId]![language]
      if (state.metadataProgress[entryId]) delete state.metadataProgress[entryId]![language]
      state.sourceRevisions[entryId] ??= {}
      state.sourceRevisions[entryId]![language] = sourceRevision
    })
  }

  removeInSession(entryId: string, language: SupportedActionLanguage, fields?: TranslationField[]) {
    immerSet((state) => {
      const translations = state.data[entryId]
      if (!translations) return
      if (fields) {
        const translation = translations[language]
        if (translation) fields.forEach((field) => (translation[field] = null))
        return
      }
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
    withContent = true,
  ) {
    immerSet((state) => {
      const records = withContent ? state.progress : state.metadataProgress
      records[entryId] ??= {}
      records[entryId]![language] = progress
    })
  }

  getProgress(entryId: string, language: SupportedActionLanguage, withContent = true) {
    return (withContent ? get().progress : get().metadataProgress)[entryId]?.[language]
  }
}

export const translationActions = new TranslationActions()

class TranslationSyncService {
  private retries = new Map<string, Promise<GeneratedEntryTranslation>>()

  retryBatch(entryId: string, language: SupportedActionLanguage, batchId: string) {
    const key = `${entryId}:${language}`
    const pending = this.retries.get(key)
    if (pending) return pending
    const progress = translationActions.getProgress(entryId, language)
    if (
      !progress?.batchState ||
      progress.status !== "incomplete" ||
      !progress.batchState.failedBatches.some((failure) => failure.id === batchId)
    ) {
      return Promise.reject(new Error("当前批次不可重试"))
    }
    const job = this.generateTranslation({
      entryId,
      language,
      withContent: true,
      target: progress.batchState.target,
      retry: { sessionId: progress.batchState.sessionId, batchId },
    }).finally(() => {
      this.retries.delete(key)
    })
    this.retries.set(key, job)
    return job
  }
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
    retry?: { sessionId: string; batchId: string }
  }): Promise<GeneratedEntryTranslation> {
    if (typeof window === "undefined" || !(window as any).electron?.ipcRenderer) {
      throw new Error("翻译功能仅在桌面应用中可用")
    }
    const requestId = globalThis.crypto.randomUUID()
    const { ipcRenderer } = (window as any).electron
    const withContent = params.withContent === true
    const getProgress = () =>
      translationActions.getProgress(params.entryId, params.language, withContent)
    const setProgress = (progress: TranslationProgressState) =>
      translationActions.setProgress(params.entryId, params.language, progress, withContent)
    const applyResult = (result: GeneratedEntryTranslation) => {
      // Cached rows contain both scopes. Only project the fields owned by this
      // request so a list response cannot replace an in-flight body translation.
      translationActions.upsertManyInSession([
        {
          entryId: params.entryId,
          language: params.language,
          title: result.title,
          description: withContent ? null : result.description,
          content: withContent && params.target === "content" ? result.content : null,
          readabilityContent:
            withContent && params.target === "readabilityContent"
              ? result.readabilityContent
              : null,
        },
      ])
    }
    const previous = params.retry ? getProgress() : undefined
    setProgress({
      ...previous,
      retryingBatchId: params.retry?.batchId,
      requestId,
      status: "translating",
      completedBatches: previous?.completedBatches ?? 0,
      totalBatches: previous?.totalBatches ?? 0,
    })
    const dispose = withContent
      ? ipcRenderer.on(
          TRANSLATION_PROGRESS_CHANNEL,
          (_event: unknown, progress: EntryTranslationProgress) => {
            const current = getProgress()
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
            applyResult(progress.translation)
            setProgress({
              requestId,
              status: "partial",
              batchState: progress.translation.batchState,
              retryingBatchId: params.retry?.batchId,
              completedBatches: progress.completedBatches,
              totalBatches: progress.totalBatches,
            })
          },
        )
      : () => {}
    try {
      const result = (await ipcRenderer.invoke("translation.generate", {
        ...params,
        requestId,
      })) as GeneratedEntryTranslation
      const current = getProgress()
      if (current?.requestId === requestId) {
        applyResult(result)
        setProgress({
          requestId,
          status: result.batchState?.failedBatches.length ? "incomplete" : "complete",
          batchState: result.batchState,
          completedBatches: result.batchState?.completedBatches ?? current.totalBatches,
          totalBatches: result.batchState?.totalBatches ?? current.totalBatches,
        })
      }
      return result
    } catch (error) {
      const current = getProgress()
      if (current?.requestId === requestId) {
        setProgress({
          requestId,
          status: params.retry && current.batchState?.failedBatches.length ? "incomplete" : "error",
          batchState: current.batchState,
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
