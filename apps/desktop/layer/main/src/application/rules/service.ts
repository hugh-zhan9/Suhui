import { randomUUID } from "node:crypto"

import type { EntryRuleActions } from "@suhui/database/schemas/postgres"
import {
  collectionsTable,
  entriesTable,
  entryRuleApplicationsTable,
  entryTagsTable,
  entryUserStateTable,
  readingQueueTable,
} from "@suhui/database/schemas/postgres"
import { EntryService } from "@suhui/database/services/entry"
import { EntryRuleService } from "@suhui/database/services/entry-rule"
import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm"

import { DBManager } from "~/manager/db"

import {
  hasRuleActions,
  matchesEntryRule,
  normalizeRuleTerms,
  normalizeTags,
} from "../local-reading/domain"

type RuleInput = {
  name: string
  enabled?: boolean
  feedIds: string[]
  titleKeywords: string[]
  actions: EntryRuleActions
}

type PreviewToken = {
  ruleId: string
  ruleVersion: number
  snapshotAt: number
  expiresAt: number
}

const HISTORY_BATCH_SIZE = 200

export class RuleApplicationService {
  private previews = new Map<string, PreviewToken>()

  listRules() {
    return EntryRuleService.getAllRules()
  }

  async createRule(input: RuleInput) {
    return DBManager.runTrackedOperation(() => this.saveRule(randomUUID(), 1, input, Date.now()))
  }

  async updateRule(id: string, input: RuleInput) {
    return DBManager.runTrackedOperation(async () => {
      const current = await EntryRuleService.getRule(id)
      if (!current) throw new Error("Rule not found")
      return this.saveRule(id, current.version + 1, input, current.createdAt)
    })
  }

  async deleteRule(id: string) {
    return DBManager.runTrackedOperation(async () => {
      const current = await EntryRuleService.getRule(id)
      if (!current) return
      await EntryRuleService.upsertRule({
        ...current,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
  }

  async processNewEntries(entryIds: string[]) {
    const [rules, entries] = await Promise.all([
      EntryRuleService.getActiveRules(),
      EntryService.getEntryMany(Array.from(new Set(entryIds))),
    ])
    let applied = 0
    for (const rule of rules) {
      const matchingEntries = entries.filter((entry) => matchesEntryRule(rule, entry))
      applied += await this.applyRule(rule, matchingEntries)
    }
    return { processed: entries.length, applied }
  }

  async previewHistory(ruleId: string) {
    const rule = await EntryRuleService.getRule(ruleId)
    if (!rule) throw new Error("Rule not found")
    const snapshotAt = Date.now()
    let matchCount = 0
    await this.scanHistory(rule, snapshotAt, async (entries) => {
      const applications = await EntryRuleService.getApplications(
        rule.id,
        rule.version,
        entries.map((entry) => entry.id),
      )
      matchCount += entries.length - applications.length
    })
    const token = randomUUID()
    const expiresAt = Date.now() + 5 * 60_000
    this.previews.set(token, { ruleId, ruleVersion: rule.version, snapshotAt, expiresAt })
    return { token, expiresAt, matchCount, actions: rule.actions }
  }

  async executeHistory(token: string) {
    return DBManager.runTrackedOperation(async () => {
      const preview = this.previews.get(token)
      this.previews.delete(token)
      if (!preview || preview.expiresAt < Date.now())
        throw new Error("Rule preview is invalid or expired")
      const rule = await EntryRuleService.getRule(preview.ruleId)
      if (!rule || rule.version !== preview.ruleVersion)
        throw new Error("Rule changed after preview")
      let applied = 0
      await this.scanHistory(rule, preview.snapshotAt, async (entries) => {
        applied += await this.applyRule(rule, entries)
      })
      return { applied }
    })
  }

  async addTags(entryId: string, tags: string[]) {
    return DBManager.runTrackedOperation(async () => {
      const normalized = normalizeTags(tags)
      await EntryRuleService.addTags(
        normalized.map((tag) => ({ entryId, tag, createdAt: Date.now() })),
      )
      return this.getTags(entryId)
    })
  }

  async getTags(entryId: string) {
    return (await EntryRuleService.getTags([entryId])).map((tag) => tag.tag)
  }

  async removeTags(entryId: string, tags: string[]) {
    return DBManager.runTrackedOperation(async () => {
      await EntryRuleService.removeTags(entryId, normalizeTags(tags))
      return this.getTags(entryId)
    })
  }

  setHidden(entryId: string, hidden: boolean) {
    return DBManager.runTrackedOperation(() =>
      EntryRuleService.setHidden(entryId, hidden, Date.now()),
    )
  }

  private async saveRule(id: string, version: number, input: RuleInput, createdAt: number) {
    const feedIds = Array.from(
      new Set(input.feedIds.map((feedId) => feedId.trim()).filter(Boolean)),
    )
    const titleKeywords = normalizeRuleTerms(input.titleKeywords)
    if (feedIds.length === 0 && titleKeywords.length === 0)
      throw new Error("Rule conditions are empty")
    if (!hasRuleActions(input.actions)) throw new Error("Rule actions are empty")
    const now = Date.now()
    const rule = {
      id,
      name: input.name.trim() || "Untitled rule",
      enabled: input.enabled ?? true,
      feedIds,
      titleKeywords,
      actions: { ...input.actions, tags: normalizeTags(input.actions.tags ?? []) },
      version,
      createdAt,
      updatedAt: now,
      deletedAt: null,
    }
    await EntryRuleService.upsertRule(rule)
    return rule
  }

  private async applyRule(
    rule: Awaited<ReturnType<typeof EntryRuleService.getRule>> & {},
    entries: Awaited<ReturnType<typeof EntryService.getEntryMany>>,
  ) {
    if (!rule || entries.length === 0) return 0
    const db = DBManager.getDB()
    return db.transaction(async (transaction) => {
      let applied = 0
      for (const entry of entries) {
        const now = Date.now()
        const inserted = await transaction
          .insert(entryRuleApplicationsTable)
          .values({
            ruleId: rule.id,
            entryId: entry.id,
            ruleVersion: rule.version,
            appliedAt: now,
          })
          .onConflictDoNothing()
          .returning({ entryId: entryRuleApplicationsTable.entryId })
        if (inserted.length === 0) continue

        if (rule.actions.markRead) {
          await transaction
            .update(entriesTable)
            .set({ read: true })
            .where(eq(entriesTable.id, entry.id))
        }
        if (rule.actions.star) {
          await transaction
            .insert(collectionsTable)
            .values({
              entryId: entry.id,
              feedId: entry.feedId,
              createdAt: new Date(now).toISOString(),
              view: 1,
              deletedAt: null,
            })
            .onConflictDoUpdate({
              target: collectionsTable.entryId,
              set: { deletedAt: null, feedId: entry.feedId },
            })
        }
        if (rule.actions.addToReadingQueue) {
          await transaction
            .insert(readingQueueTable)
            .values({
              entryId: entry.id,
              status: "pending",
              addedAt: now,
              completedAt: null,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: readingQueueTable.entryId,
              set: {
                status: "pending",
                addedAt: sql`CASE WHEN ${readingQueueTable.status} = 'pending' THEN ${readingQueueTable.addedAt} ELSE ${now} END`,
                completedAt: null,
                updatedAt: now,
              },
            })
        }
        if (rule.actions.hide) {
          await transaction
            .insert(entryUserStateTable)
            .values({ entryId: entry.id, hidden: true, updatedAt: now })
            .onConflictDoUpdate({
              target: entryUserStateTable.entryId,
              set: { hidden: true, updatedAt: now },
            })
        }
        const tags = normalizeTags(rule.actions.tags ?? [])
        if (tags.length > 0) {
          await transaction
            .insert(entryTagsTable)
            .values(tags.map((tag) => ({ entryId: entry.id, tag, createdAt: now })))
            .onConflictDoNothing()
        }
        applied += 1
      }
      return applied
    })
  }

  private async scanHistory(
    rule: NonNullable<Awaited<ReturnType<typeof EntryRuleService.getRule>>>,
    snapshotAt: number,
    visit: (entries: Awaited<ReturnType<typeof EntryService.getEntryMany>>) => Promise<void>,
  ) {
    const db = DBManager.getDB()
    let afterId: string | undefined
    while (true) {
      const page = await db.query.entriesTable.findMany({
        where: (entry) =>
          and(
            isNull(entry.deletedAt),
            lte(entry.insertedAt, snapshotAt),
            afterId ? gt(entry.id, afterId) : undefined,
          ),
        orderBy: (entry) => asc(entry.id),
        limit: HISTORY_BATCH_SIZE,
      })
      const matching = page.filter((entry) => matchesEntryRule(rule, entry))
      if (matching.length > 0) await visit(matching)
      if (page.length < HISTORY_BATCH_SIZE) return
      afterId = page.at(-1)!.id
    }
  }
}

export const ruleApplicationService = new RuleApplicationService()
