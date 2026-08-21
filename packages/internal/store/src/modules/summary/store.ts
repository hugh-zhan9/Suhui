import type { SummarySchema } from "@suhui/database/schemas/types"
import { summaryService } from "@suhui/database/services/summary"
import type { SupportedActionLanguage } from "@suhui/shared"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import type { SummaryGeneratingStatus } from "./enum"
import type { StatusID } from "./utils"

type SummaryModel = Omit<SummarySchema, "createdAt">

interface SummaryData {
  summary: string
  readabilitySummary: string | null
  lastAccessed: number
}

interface SummaryState {
  /**
   * Key: entryId
   * Value: language -> SummaryData
   */
  data: Record<string, Partial<Record<SupportedActionLanguage, SummaryData>>>

  generatingStatus: Record<StatusID, SummaryGeneratingStatus>
}
const emptyDataSet: Record<string, Partial<Record<SupportedActionLanguage, SummaryData>>> = {}

export const useSummaryStore = createZustandStore<SummaryState>("summary")(() => ({
  data: emptyDataSet,
  generatingStatus: {},
}))

const get = useSummaryStore.getState
const set = useSummaryStore.setState
const immerSet = createImmerSetter(useSummaryStore)
class SummaryActions implements Resetable, Hydratable {
  async hydrate() {
    const summaries = await summaryService.getAllSummaries()
    this.upsertManyInSession(summaries)
  }

  upsertManyInSession(summaries: SummaryModel[]) {
    const now = Date.now()
    immerSet((state) => {
      summaries.forEach((summary) => {
        if (!summary.language) return

        if (!state.data[summary.entryId]) {
          state.data[summary.entryId] = {}
        }
        if (!state.data[summary.entryId]![summary.language]) {
          state.data[summary.entryId]![summary.language] = {
            summary: "",
            readabilitySummary: null,
            lastAccessed: now,
          }
        }

        state.data[summary.entryId]![summary.language] = {
          summary: summary.summary || state.data[summary.entryId]![summary.language]!.summary || "",
          readabilitySummary:
            summary.readabilitySummary ||
            state.data[summary.entryId]![summary.language]!.readabilitySummary ||
            null,
          lastAccessed: now,
        }
      })
    })

    this.batchClean()
  }

  async upsertMany(summaries: SummaryModel[]) {
    this.upsertManyInSession(summaries)

    for (const summary of summaries) {
      summaryService.insertSummary(summary)
    }
  }

  getSummary(entryId: string, language: SupportedActionLanguage) {
    const state = get()
    const summary = state.data[entryId]?.[language]

    if (summary) {
      immerSet((state) => {
        if (state.data[entryId]) {
          state.data[entryId]![language]!.lastAccessed = Date.now()
        }
      })
    }

    return summary
  }

  private batchClean() {
    const state = get()
    const entries = Object.entries(state.data)
      .map(([, data]) => data)
      .flatMap((data) => Object.entries(data))

    if (entries.length <= 10) return

    const sortedEntries = entries.sort(
      ([, a], [, b]) => (a?.lastAccessed || 0) - (b?.lastAccessed || 0),
    )

    const entriesToRemove = sortedEntries.slice(0, entries.length - 10)

    immerSet((state) => {
      entriesToRemove.forEach(([entryId]) => {
        delete state.data[entryId]
      })
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set({
        data: emptyDataSet,
        generatingStatus: {},
      })
    })
    tx.persist(() => {
      summaryService.purgeAllForMaintenance()
    })

    await tx.run()
  }
}

export const summaryActions = new SummaryActions()

class SummarySyncService {
  private pendingPromises: Record<StatusID, Promise<string>> = {}

  /**
   * No local summarizer exists and there is no remote service, so this is a
   * no-op. Rows already cached in summariesTable still render.
   */
  async generateSummary(_params: {
    entryId: string
    target: "content" | "readabilityContent"
    actionLanguage: SupportedActionLanguage
  }): Promise<string | null> {
    return null
  }
}

export const summarySyncService = new SummarySyncService()
