import { and, eq, inArray, isNull } from "drizzle-orm"

import { db } from "../db"
import {
  entryRuleApplicationsTable,
  entryRulesTable,
  entryTagsTable,
  entryUserStateTable,
} from "../schemas"
import type { EntryRuleApplicationSchema, EntryRuleSchema, EntryTagSchema } from "../schemas/types"

class EntryRuleServiceStatic {
  getActiveRules() {
    return db.query.entryRulesTable.findMany({
      where: and(eq(entryRulesTable.enabled, true), isNull(entryRulesTable.deletedAt)),
    })
  }

  getAllRules() {
    return db.query.entryRulesTable.findMany({ where: isNull(entryRulesTable.deletedAt) })
  }

  getRule(id: string) {
    return db.query.entryRulesTable.findFirst({
      where: and(eq(entryRulesTable.id, id), isNull(entryRulesTable.deletedAt)),
    })
  }

  async upsertRule(rule: EntryRuleSchema) {
    await db
      .insert(entryRulesTable)
      .values(rule)
      .onConflictDoUpdate({
        target: entryRulesTable.id,
        set: {
          name: rule.name,
          enabled: rule.enabled,
          feedIds: rule.feedIds,
          titleKeywords: rule.titleKeywords,
          actions: rule.actions,
          version: rule.version,
          updatedAt: rule.updatedAt,
          deletedAt: rule.deletedAt,
        },
      })
  }

  async recordApplications(applications: EntryRuleApplicationSchema[]) {
    if (applications.length === 0) return
    await db.insert(entryRuleApplicationsTable).values(applications).onConflictDoNothing()
  }

  getApplications(ruleId: string, ruleVersion: number, entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([])
    return db.query.entryRuleApplicationsTable.findMany({
      where: and(
        eq(entryRuleApplicationsTable.ruleId, ruleId),
        eq(entryRuleApplicationsTable.ruleVersion, ruleVersion),
        inArray(entryRuleApplicationsTable.entryId, entryIds),
      ),
    })
  }

  async addTags(tags: EntryTagSchema[]) {
    if (tags.length === 0) return
    await db.insert(entryTagsTable).values(tags).onConflictDoNothing()
  }

  getTags(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([])
    return db.query.entryTagsTable.findMany({
      where: inArray(entryTagsTable.entryId, entryIds),
    })
  }

  async setHidden(entryId: string, hidden: boolean, updatedAt: number) {
    await db.insert(entryUserStateTable).values({ entryId, hidden, updatedAt }).onConflictDoUpdate({
      target: entryUserStateTable.entryId,
      set: { hidden, updatedAt },
    })
  }

  async removeTags(entryId: string, tags: string[]) {
    if (tags.length === 0) return
    await db
      .delete(entryTagsTable)
      .where(and(eq(entryTagsTable.entryId, entryId), inArray(entryTagsTable.tag, tags)))
  }
}

export const EntryRuleService = new EntryRuleServiceStatic()
