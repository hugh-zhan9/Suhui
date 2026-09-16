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
  retryingBatchIds?: string[]
  generationActive?: boolean
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
    // Persisted rows are validated against source fingerprints in main
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
    const progress = translationActions.getProgress(entryId, language)
    const key = `${entryId}:${language}:${progress?.requestId}:${batchId}`
    const pending = this.retries.get(key)
    if (pending) return pending
    if (
      !progress?.batchState ||
      progress.generationActive ||
      !["incomplete", "partial"].includes(progress.status) ||
      !progress.batchState.failedBatches.some((failure) => failure.id === batchId)
    ) {
      return Promise.reject(new Error("当前批次不可重试"))
    }
    const job = this.runRetry(entryId, language, batchId, progress).finally(() => {
      this.retries.delete(key)
    })
    this.retries.set(key, job)
    return job
  }

  private async runRetry(
    entryId: string,
    language: SupportedActionLanguage,
    batchId: string,
    root: TranslationProgressState,
  ): Promise<GeneratedEntryTranslation> {
    const ipcRenderer =
      typeof window === "undefined" ? undefined : (window as any).electron?.ipcRenderer
    if (!ipcRenderer) throw new Error("翻译功能仅在桌面应用中可用")
    const requestId = globalThis.crypto.randomUUID()
    const { sessionId } = root.batchState!
    const current = () => {
      const value = translationActions.getProgress(entryId, language)
      return value?.requestId === root.requestId && value.batchState?.sessionId === sessionId
        ? value
        : undefined
    }
    const write = (value: TranslationProgressState) =>
      translationActions.setProgress(entryId, language, value)
    write({
      ...root,
      status: "partial",
      error: undefined,
      retryingBatchIds: [...(root.retryingBatchIds ?? []), batchId],
    })
    const apply = (result: GeneratedEntryTranslation) => {
      const state = current()
      const snapshot = result.batchState
      if (
        !state ||
        result.entryId !== entryId ||
        result.language !== language ||
        !snapshot ||
        snapshot.sessionId !== sessionId ||
        (snapshot.revision ?? 0) < (state.batchState?.revision ?? 0)
      )
        return
      translationActions.upsertManyInSession([
        {
          entryId,
          language,
          title: result.title,
          [root.batchState!.target]: result[root.batchState!.target],
        },
      ])
      write({
        ...state,
        batchState: snapshot,
        completedBatches: snapshot.completedBatches,
        totalBatches: snapshot.totalBatches,
      })
    }
    const dispose = ipcRenderer.on(
      TRANSLATION_PROGRESS_CHANNEL,
      (_event: unknown, event: EntryTranslationProgress) => {
        if (
          event?.requestId === requestId &&
          event.entryId === entryId &&
          event.language === language
        )
          apply(event.translation)
      },
    )
    try {
      const result = (await ipcRenderer.invoke("translation.generate", {
        entryId,
        language,
        requestId,
        withContent: true,
        target: root.batchState!.target,
        retry: { sessionId, batchId },
      })) as GeneratedEntryTranslation
      apply(result)
      return result
    } catch (error) {
      const state = current()
      if (state) write({ ...state, error: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      dispose()
      const state = current()
      if (state) {
        const retryingBatchIds = state.retryingBatchIds?.filter((id) => id !== batchId) ?? []
        write({
          ...state,
          retryingBatchIds,
          status:
            retryingBatchIds.length > 0
              ? "partial"
              : state.batchState?.failedBatches.length
                ? "incomplete"
                : state.error
                  ? "error"
                  : "complete",
        })
      }
    }
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
    force?: boolean
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
    setProgress({
      generationActive: true,
      requestId,
      status: "translating",
      completedBatches: 0,
      totalBatches: 0,
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
              generationActive: true,
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
          status: "error",
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
