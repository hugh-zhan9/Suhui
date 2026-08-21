import type { TranslationSchema } from "@suhui/database/schemas/types"
import { TranslationService } from "@suhui/database/services/translation"
import type { SupportedActionLanguage } from "@suhui/shared"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import type { EntryTranslation, TranslationMode } from "./types"
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
    const translations = await TranslationService.getTranslationToHydrate()
    translationActions.upsertManyInSession(translations)
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => TranslationService.purgeAllForMaintenance())

    await tx.run()
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
  private currentMode?: TranslationMode

  private async ensureMode(mode: TranslationMode) {
    if (!this.currentMode) {
      this.currentMode = mode
      return
    }

    if (this.currentMode === mode) return

    this.currentMode = mode
    await translationActions.reset()
  }

  /**
   * No local translation engine exists and there is no remote service, so this
   * is a no-op. Rows already cached in translationsTable still render.
   */
  async generateTranslation(_params: {
    entryId: string
    language: SupportedActionLanguage
    withContent?: boolean
    target: "content" | "readabilityContent"
    mode?: TranslationMode
  }): Promise<null> {
    return null
  }
}

export const translationSyncService = new TranslationSyncService()
