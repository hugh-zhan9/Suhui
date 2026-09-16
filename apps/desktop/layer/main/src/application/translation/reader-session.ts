import type {
  GeneratedEntryTranslation,
  GenerateEntryTranslationInput,
  TranslationBatchFailure,
  TranslationBatchState,
} from "@suhui/shared"

import type { TranslationTrace } from "./diagnostics"
import { logTranslation, translationErrorKind } from "./diagnostics"
import { createHtmlTranslationPlan, splitTranslationParagraph } from "./html"
import type { TranslationProviderRuntimeConfig } from "./provider"
import { translateTexts } from "./provider"
import type { TranslationRequestPool } from "./request-pool"
import { ARTICLE_TRANSLATION_CONCURRENCY } from "./request-pool"

export const TRANSLATION_PLAN_VERSION = 1
export interface SavedTranslationBatch {
  batchId: string
  values: string[]
}

// Main owns unfinished sessions; successful slots are also saved through TranslationService.
export class ReaderTranslationSession {
  private readonly plan
  private readonly translated: Array<string | undefined>
  private readonly titleParts: string[]
  private readonly tasks: Array<{
    id: string
    target: TranslationBatchFailure["target"]
    batchIndex: number
    texts: string[]
    offset: number
    done: boolean
    values?: string[]
  }> = []
  private readonly failures = new Map<string, TranslationBatchFailure>()
  private readonly titleResults = new Map<number, string>()

  private revision = 0
  private readonly inFlight = new Map<string, Promise<void>>()
  private readonly listeners = new Set<(result: GeneratedEntryTranslation) => void>()

  constructor(
    readonly id: string,
    readonly input: GenerateEntryTranslationInput,
    readonly sourceHash: string,
    readonly configHash: string,
    source: { title?: string | null; content?: string | null; readabilityContent?: string | null },
    private readonly result: GeneratedEntryTranslation,
    saved: SavedTranslationBatch[],
    private readonly save: (batch: SavedTranslationBatch) => Promise<void>,
    private readonly pool: TranslationRequestPool,
  ) {
    this.plan = createHtmlTranslationPlan(result[input.target] ? "" : (source[input.target] ?? ""))
    if (!result[input.target] && source[input.target])
      result[input.target] = this.plan.rebuildPartial([])
    this.translated = Array.from({ length: this.plan.units.length })
    this.titleParts = result.title ? [] : splitTranslationParagraph(source.title ?? "")
    let titleBatch = 0
    this.titleParts.forEach((part, offset) => {
      if (!part.trim()) return
      const batchIndex = ++titleBatch
      this.tasks.push({
        id: `title:${batchIndex}`,
        target: "title",
        batchIndex,
        texts: [part.trim()],
        offset,
        done: false,
      })
    })
    const remainingTitleTasks = this.tasks.splice(1)
    let offset = 0
    this.plan.batches.forEach((texts, index) => {
      this.tasks.push({
        id: `${input.target}:${index + 1}`,
        target: input.target,
        batchIndex: index + 1,
        texts,
        offset,
        done: false,
      })
      offset += texts.length
    })
    this.tasks.push(...remainingTitleTasks)
    for (const batch of saved) {
      const task = this.tasks.find((candidate) => candidate.id === batch.batchId)
      if (
        !task ||
        !Array.isArray(batch.values) ||
        batch.values.length !== task.texts.length ||
        batch.values.some((value) => typeof value !== "string" || !value.trim())
      )
        continue
      task.values = batch.values
      this.completeTask(task)
    }
  }

  get state(): TranslationBatchState {
    return {
      sessionId: this.id,
      revision: this.revision,
      target: this.input.target,
      completedBatches: this.tasks.filter((task) => task.target !== "title" && task.done).length,
      totalBatches: this.plan.batches.length,
      failedBatches: [...this.failures.values()],
    }
  }

  snapshot(): GeneratedEntryTranslation {
    const markers = new Map<number, string>()
    for (const task of this.tasks) {
      if (task.target !== "title" && this.failures.has(task.id)) {
        markers.set(task.offset + task.texts.length - 1, `${this.id}:${task.id}`)
      }
    }
    if (this.plan.batches.length > 0)
      this.result[this.input.target] = this.plan.rebuildPartial(this.translated, markers)
    if (
      this.titleParts.length > 0 &&
      this.tasks.filter((task) => task.target === "title").every((task) => task.done)
    ) {
      this.result.title = this.titleParts
        .map((part, index) => this.titleResults.get(index) ?? part)
        .join("")
    }
    return { ...this.result, batchState: this.state }
  }

  async run(
    config: () => TranslationProviderRuntimeConfig,
    fetchImpl: typeof globalThis.fetch,
    trace: TranslationTrace,
    onProgress: (result: GeneratedEntryTranslation) => void,
    retryBatchId?: string,
  ) {
    if (retryBatchId && !this.failures.has(retryBatchId))
      throw new Error("该批次已完成或不属于此翻译会话")
    const tasks = retryBatchId
      ? this.tasks.filter((task) => task.id === retryBatchId)
      : this.tasks.filter((task) => !task.done)
    logTranslation(trace, retryBatchId ? "batch.retry_started" : "body.planned", {
      sessionId: this.id,
      totalBatches: this.plan.batches.length,
      characters: this.plan.units.reduce((sum, text) => sum + text.length, 0),
    })
    // Resolve credentials once, before batch isolation. A denied key must not be
    // requested again for every paragraph. Fully saved runs need no credentials.
    onProgress(this.snapshot())
    const runtime = tasks.some((task) => !task.values) ? config() : undefined
    this.listeners.add(onProgress)
    let next = 0
    const worker = async () => {
      while (next < tasks.length) {
        const task = tasks[next++]!
        let pending = this.inFlight.get(task.id)
        if (!pending) {
          pending = this.pool
            .run(async () => {
              const batchTrace = {
                ...trace,
                target: task.target,
                batchIndex: task.batchIndex,
                totalBatches: this.tasks.filter((candidate) => candidate.target === task.target)
                  .length,
              }
              try {
                task.values ??= await translateTexts(
                  runtime!,
                  task.texts,
                  this.input.language,
                  fetchImpl,
                  batchTrace,
                )
                try {
                  await this.save({ batchId: task.id, values: task.values })
                } catch (error) {
                  logTranslation(batchTrace, "batch.persist_failed", {
                    errorKind: translationErrorKind(error),
                  })
                  throw new Error("译文保存到数据库失败，请重试保存", { cause: error })
                }
                this.completeTask(task)
              } catch (error) {
                const message = error instanceof Error ? error.message : "翻译请求失败"
                this.failures.set(task.id, {
                  id: task.id,
                  target: task.target,
                  batchIndex: task.batchIndex,
                  error: message.includes(trace.traceId)
                    ? message
                    : `${message}\n诊断 ID：${trace.traceId}`,
                })
                logTranslation(batchTrace, "batch.failed", {
                  errorKind: translationErrorKind(error),
                })
              }
              this.revision += 1
              for (const listener of this.listeners) listener(this.snapshot())
              logTranslation(trace, "body.progress", {
                completedBatches: this.state.completedBatches,
                totalBatches: this.state.totalBatches,
                failedBatches: this.failures.size,
              })
            })
            .finally(() => this.inFlight.delete(task.id))
          this.inFlight.set(task.id, pending)
        }
        await pending
      }
    }
    try {
      const settled = await Promise.allSettled(
        Array.from({ length: Math.min(ARTICLE_TRANSLATION_CONCURRENCY, tasks.length) }, worker),
      )
      const failed = settled.find((result) => result.status === "rejected")
      if (failed?.status === "rejected") throw failed.reason
      return this.snapshot()
    } finally {
      this.listeners.delete(onProgress)
    }
  }

  private completeTask(task: (typeof this.tasks)[number]) {
    if (task.target === "title") {
      const part = this.titleParts[task.offset]!
      const start = part.indexOf(part.trim())
      this.titleResults.set(
        task.offset,
        `${part.slice(0, start)}${task.values![0]}${part.slice(start + part.trim().length)}`,
      )
    } else {
      task.values!.forEach((value, index) => {
        this.translated[task.offset + index] = value
      })
    }
    task.done = true
    this.failures.delete(task.id)
  }
}
