import type { EntryRuleActions } from "@suhui/database/schemas/postgres"

export const normalizeRuleTerms = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean)))

export const normalizeTags = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))

export const hasRuleActions = (actions: EntryRuleActions) =>
  actions.markRead === true ||
  actions.star === true ||
  actions.addToReadingQueue === true ||
  actions.hide === true ||
  normalizeTags(actions.tags ?? []).length > 0

export const matchesEntryRule = (
  rule: { feedIds: string[]; titleKeywords: string[] },
  entry: { feedId: string | null; title: string | null },
) => {
  const feeds = new Set(rule.feedIds.map((feedId) => feedId.trim()).filter(Boolean))
  const keywords = normalizeRuleTerms(rule.titleKeywords)
  if (feeds.size === 0 && keywords.length === 0) return false
  if (feeds.size > 0 && (!entry.feedId || !feeds.has(entry.feedId))) return false
  if (keywords.length === 0) return true
  const title = (entry.title ?? "").toLocaleLowerCase()
  return keywords.some((keyword) => title.includes(keyword))
}

export type ReadingQueueState = {
  status: "pending" | "completed"
  addedAt: number
  completedAt: number | null
  updatedAt: number
}

export const requeue = (current: ReadingQueueState | null, now: number): ReadingQueueState => ({
  status: "pending",
  addedAt: current?.status === "pending" ? current.addedAt : now,
  completedAt: null,
  updatedAt: now,
})

export const completeQueueItem = (current: ReadingQueueState, now: number): ReadingQueueState => ({
  ...current,
  status: "completed",
  completedAt: current.completedAt ?? now,
  updatedAt: now,
})
