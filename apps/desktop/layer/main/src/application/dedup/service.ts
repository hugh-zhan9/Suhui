import { createHash } from "node:crypto"

import { ContentClusterService } from "@suhui/database/services/content-cluster"
import { EntryService } from "@suhui/database/services/entry"
import { and, asc, between, gt, isNull, ne } from "drizzle-orm"

import { DBManager } from "~/manager/db"

import { createEntryFingerprint, createTextFingerprint } from "./fingerprint"

const ALGORITHM_VERSION = 1
const CLUSTER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const REBUILD_BATCH_SIZE = 200

export class DedupApplicationService {
  private clusterOperation: Promise<void> = Promise.resolve()

  private serializeClusterOperation<T>(operation: () => Promise<T>) {
    const result = this.clusterOperation.then(operation, operation)
    this.clusterOperation = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  processEntries(entryIds: string[]) {
    return this.serializeClusterOperation(() =>
      DBManager.runTrackedOperation(() => this.processEntriesUnlocked(entryIds)),
    )
  }

  private async processEntriesUnlocked(entryIds: string[]) {
    const entries = await EntryService.getEntryMany(Array.from(new Set(entryIds)))
    const exclusions = new Set(
      (await ContentClusterService.getExclusions(entries.map((entry) => entry.id))).map(
        (exclusion) => exclusion.entryId,
      ),
    )
    let clustered = 0
    for (const entry of entries) {
      const fingerprint = createEntryFingerprint(entry)
      if (!fingerprint) continue
      if (exclusions.has(entry.id)) continue
      const candidates = await ContentClusterService.getMembersByFingerprint(
        fingerprint.fingerprint,
      )
      let clusterId: string | undefined
      let relatedMember:
        | {
            id: string
            fingerprint: string
            basis: "canonical_url" | "title_content"
          }
        | undefined
      if (candidates.length > 0) {
        const candidateEntries = await EntryService.getEntryMany(
          candidates.map((candidate) => candidate.entryId),
        )
        const matching = candidateEntries.find(
          (candidate) =>
            candidate.feedId !== entry.feedId &&
            Math.abs(candidate.publishedAt - entry.publishedAt) <= CLUSTER_WINDOW_MS,
        )
        clusterId = candidates.find((candidate) => candidate.entryId === matching?.id)?.clusterId
        if (matching) {
          relatedMember = {
            id: matching.id,
            fingerprint: fingerprint.fingerprint,
            basis: fingerprint.basis,
          }
        }
      }
      if (!clusterId) {
        const textFingerprint = createTextFingerprint(entry)
        if (textFingerprint) {
          const db = DBManager.getDB()
          const nearbyEntries = await db.query.entriesTable.findMany({
            where: (candidate) =>
              and(
                ne(candidate.id, entry.id),
                isNull(candidate.deletedAt),
                between(
                  candidate.publishedAt,
                  entry.publishedAt - CLUSTER_WINDOW_MS,
                  entry.publishedAt + CLUSTER_WINDOW_MS,
                ),
              ),
            limit: 500,
          })
          const matching = nearbyEntries.find(
            (candidate) =>
              candidate.feedId !== entry.feedId &&
              createTextFingerprint(candidate)?.fingerprint === textFingerprint.fingerprint,
          )
          if (matching) {
            const [membership] = await ContentClusterService.getMembersByEntryIds([matching.id])
            clusterId = membership?.clusterId
            fingerprint.fingerprint = textFingerprint.fingerprint
            fingerprint.basis = textFingerprint.basis
            relatedMember = {
              id: matching.id,
              fingerprint: textFingerprint.fingerprint,
              basis: textFingerprint.basis,
            }
          }
        }
      }
      clusterId ??= createHash("sha256").update(`cluster:${fingerprint.fingerprint}`).digest("hex")
      const now = Date.now()
      await ContentClusterService.upsertCluster({
        id: clusterId,
        manualRepresentativeEntryId: null,
        createdAt: now,
        updatedAt: now,
      })
      await ContentClusterService.upsertMembers([
        ...(relatedMember
          ? [
              {
                entryId: relatedMember.id,
                clusterId,
                fingerprint: relatedMember.fingerprint,
                basis: relatedMember.basis,
                algorithmVersion: ALGORITHM_VERSION,
                createdAt: now,
              },
            ]
          : []),
        {
          entryId: entry.id,
          clusterId,
          fingerprint: fingerprint.fingerprint,
          basis: fingerprint.basis,
          algorithmVersion: ALGORITHM_VERSION,
          createdAt: now,
        },
      ])
      clustered += 1
    }
    return { processed: entries.length, clustered }
  }

  async rebuild(entryIds?: string[]) {
    return this.serializeClusterOperation(() =>
      DBManager.runTrackedOperation(() => this.rebuildUnlocked(entryIds)),
    )
  }

  private async rebuildUnlocked(entryIds?: string[]) {
    const ids = Array.from(new Set(entryIds ?? []))
    let processed = 0
    let clustered = 0
    if (entryIds?.length) {
      for (let index = 0; index < ids.length; index += REBUILD_BATCH_SIZE) {
        const result = await this.rebuildBatch(ids.slice(index, index + REBUILD_BATCH_SIZE))
        processed += result.processed
        clustered += result.clustered
      }
    } else {
      const db = DBManager.getDB()
      const pool = DBManager.getPgPool()
      await pool.query(
        `INSERT INTO content_cluster_rebuild_state (id, after_entry_id, processed, clustered, updated_at)
         VALUES (1, NULL, 0, 0, $1) ON CONFLICT (id) DO NOTHING`,
        [Date.now()],
      )
      const state = await pool.query<{
        after_entry_id: string | null
        batch_entry_ids: string[]
        manual_entry_ids: string[]
        processed: string | number
        clustered: string | number
      }>(
        `SELECT after_entry_id, batch_entry_ids, manual_entry_ids, processed, clustered
         FROM content_cluster_rebuild_state WHERE id = 1`,
      )
      let afterId = state.rows[0]?.after_entry_id ?? undefined
      processed = Number(state.rows[0]?.processed ?? 0)
      clustered = Number(state.rows[0]?.clustered ?? 0)
      while (true) {
        const pendingIds = state.rows[0]?.batch_entry_ids ?? []
        const page = pendingIds.length
          ? pendingIds.map((id) => ({ id }))
          : await db.query.entriesTable.findMany({
              where: (entry) =>
                and(isNull(entry.deletedAt), afterId ? gt(entry.id, afterId) : undefined),
              orderBy: (entry) => asc(entry.id),
              columns: { id: true },
              limit: REBUILD_BATCH_SIZE,
            })
        const pageIds = page.map((entry) => entry.id)
        if (pageIds.length === 0) {
          await pool.query("DELETE FROM content_cluster_rebuild_state WHERE id = 1")
          break
        }
        const manualIds = pendingIds.length
          ? (state.rows[0]?.manual_entry_ids ?? [])
          : await this.findManualEntryIds(pageIds)
        if (!pendingIds.length) {
          await pool.query(
            `UPDATE content_cluster_rebuild_state
             SET batch_entry_ids = $1::jsonb, manual_entry_ids = $2::jsonb, updated_at = $3
             WHERE id = 1`,
            [JSON.stringify(pageIds), JSON.stringify(manualIds), Date.now()],
          )
        }
        const result = await this.rebuildBatch(pageIds, manualIds)
        processed += result.processed
        clustered += result.clustered
        afterId = pageIds.at(-1)!
        await pool.query(
          `UPDATE content_cluster_rebuild_state
           SET after_entry_id = $1, batch_entry_ids = '[]'::jsonb,
             manual_entry_ids = '[]'::jsonb, processed = $2, clustered = $3, updated_at = $4
           WHERE id = 1`,
          [afterId, processed, clustered, Date.now()],
        )
        if (state.rows[0]) {
          state.rows[0].batch_entry_ids = []
          state.rows[0].manual_entry_ids = []
        }
      }
    }
    return { processed, clustered }
  }

  private async findManualEntryIds(ids: string[]) {
    const oldMemberships = await ContentClusterService.getMembersByEntryIds(ids)
    const oldClusters = await ContentClusterService.getClustersByIds(
      Array.from(new Set(oldMemberships.map((member) => member.clusterId))),
    )
    return oldClusters.flatMap((cluster) =>
      cluster.manualRepresentativeEntryId && ids.includes(cluster.manualRepresentativeEntryId)
        ? [cluster.manualRepresentativeEntryId]
        : [],
    )
  }

  private async rebuildBatch(ids: string[], preservedManualIds?: string[]) {
    const manualIds = preservedManualIds ?? (await this.findManualEntryIds(ids))
    await ContentClusterService.removeMembers(ids)
    const result = await this.processEntriesUnlocked(ids)
    const rebuiltMemberships = await ContentClusterService.getMembersByEntryIds(manualIds)
    for (const membership of rebuiltMemberships) {
      await ContentClusterService.setManualRepresentative(
        membership.clusterId,
        membership.entryId,
        Date.now(),
      )
    }
    return result
  }

  setRepresentative(clusterId: string, entryId: string | null) {
    return this.serializeClusterOperation(() =>
      DBManager.runTrackedOperation(() => this.setRepresentativeValidated(clusterId, entryId)),
    )
  }

  splitMember(clusterId: string, entryId: string) {
    return this.serializeClusterOperation(() =>
      DBManager.runTrackedOperation(async () => {
        const [membership] = await ContentClusterService.getMembersByEntryIds([entryId])
        if (!membership || membership.clusterId !== clusterId) {
          throw new Error("Entry is not a member of the cluster")
        }
        await ContentClusterService.excludeMember(entryId, membership.fingerprint, Date.now())
      }),
    )
  }

  private async setRepresentativeValidated(clusterId: string, entryId: string | null) {
    if (!clusterId.trim()) throw new Error("Cluster id is empty")
    const cluster = await ContentClusterService.getCluster(clusterId)
    if (!cluster) throw new Error("Cluster not found")
    if (entryId !== null) {
      const [membership] = await ContentClusterService.getMembersByEntryIds([entryId])
      if (membership?.clusterId !== clusterId) {
        throw new Error("Representative entry is not a member of the cluster")
      }
    }
    await ContentClusterService.setManualRepresentative(clusterId, entryId, Date.now())
  }
}

export const dedupApplicationService = new DedupApplicationService()
