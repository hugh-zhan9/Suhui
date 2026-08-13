import { DBManager } from "~/manager/db"

import { dedupApplicationService } from "../dedup/service"
import { ruleApplicationService } from "../rules/service"

export class LocalReadingPipeline {
  async processNewEntries(entryIds: string[]) {
    const uniqueEntryIds = Array.from(new Set(entryIds.filter(Boolean)))
    if (uniqueEntryIds.length === 0) return { dedup: null, rules: null }
    return DBManager.runTrackedOperation(() => this.processNewEntriesUnlocked(uniqueEntryIds))
  }

  private async processNewEntriesUnlocked(uniqueEntryIds: string[]) {
    const [dedup, rules] = await Promise.allSettled([
      dedupApplicationService.processEntries(uniqueEntryIds),
      ruleApplicationService.processNewEntries(uniqueEntryIds),
    ])
    if (dedup.status === "rejected") {
      console.warn("[LocalReadingPipeline] dedup failed", {
        error: dedup.reason instanceof Error ? dedup.reason.message : String(dedup.reason),
      })
    }
    if (rules.status === "rejected") {
      console.warn("[LocalReadingPipeline] rule application failed", {
        error: rules.reason instanceof Error ? rules.reason.message : String(rules.reason),
      })
    }
    return {
      dedup: dedup.status === "fulfilled" ? dedup.value : null,
      rules: rules.status === "fulfilled" ? rules.value : null,
    }
  }
}

export const localReadingPipeline = new LocalReadingPipeline()
