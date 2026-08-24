import type { TranslationSchema } from "@suhui/database/schemas/types"
import { TranslationService } from "@suhui/database/services/translation"
import type { SupportedActionLanguage } from "@suhui/shared"
import type { GeneratedEntryTranslation } from "@suhui/shared/translation"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import type { EntryTranslation } from "./types"
import { translationFields } from "./types"

type TranslationModel = Omit<TranslationSchema, "createdAt">
interface TranslationState {
  data: Record<string, Partial<Record<SupportedActionLanguage, EntryTranslation>>>
}
const defaultState: TranslationState = {
  data: {},
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
}

export const translationActions = new TranslationActions()

class TranslationSyncService {
  async generateTranslation(params: {
    entryId: string
    language: SupportedActionLanguage
    withContent?: boolean
    target: "content" | "readabilityContent"
  }): Promise<GeneratedEntryTranslation> {
    if (typeof window === "undefined" || !(window as any).electron?.ipcRenderer) {
      throw new Error("翻译功能仅在桌面应用中可用")
    }
    const result = (await (window as any).electron.ipcRenderer.invoke(
      "translation.generate",
      params,
    )) as GeneratedEntryTranslation
    translationActions.upsertManyInSession([result])
    return result
  }
}

export const translationSyncService = new TranslationSyncService()
