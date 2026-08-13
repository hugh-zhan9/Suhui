import { eq, inArray } from "drizzle-orm"

import { db } from "../db"
import {
  contentClusterExclusionsTable,
  contentClusterMembersTable,
  contentClustersTable,
} from "../schemas"
import type { ContentClusterMemberSchema, ContentClusterSchema } from "../schemas/types"

class ContentClusterServiceStatic {
  async upsertCluster(cluster: ContentClusterSchema) {
    await db
      .insert(contentClustersTable)
      .values(cluster)
      .onConflictDoUpdate({
        target: contentClustersTable.id,
        set: {
          updatedAt: cluster.updatedAt,
        },
      })
  }

  async upsertMembers(members: ContentClusterMemberSchema[]) {
    if (members.length === 0) return
    await Promise.all(
      members.map((member) =>
        db
          .insert(contentClusterMembersTable)
          .values(member)
          .onConflictDoUpdate({
            target: contentClusterMembersTable.entryId,
            set: {
              clusterId: member.clusterId,
              fingerprint: member.fingerprint,
              basis: member.basis,
              algorithmVersion: member.algorithmVersion,
            },
          }),
      ),
    )
  }

  getMembersByEntryIds(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([])
    return db.query.contentClusterMembersTable.findMany({
      where: inArray(contentClusterMembersTable.entryId, entryIds),
    })
  }

  getMembersByFingerprint(fingerprint: string) {
    return db.query.contentClusterMembersTable.findMany({
      where: eq(contentClusterMembersTable.fingerprint, fingerprint),
    })
  }

  getCluster(clusterId: string) {
    return db.query.contentClustersTable.findFirst({
      where: eq(contentClustersTable.id, clusterId),
    })
  }

  getClustersByIds(clusterIds: string[]) {
    if (clusterIds.length === 0) return Promise.resolve([])
    return db.query.contentClustersTable.findMany({
      where: inArray(contentClustersTable.id, clusterIds),
    })
  }

  getExclusions(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([])
    return db.query.contentClusterExclusionsTable.findMany({
      where: inArray(contentClusterExclusionsTable.entryId, entryIds),
    })
  }

  async excludeMember(entryId: string, fingerprint: string, createdAt: number) {
    await db
      .insert(contentClusterExclusionsTable)
      .values({ entryId, fingerprint, createdAt })
      .onConflictDoUpdate({
        target: contentClusterExclusionsTable.entryId,
        set: { fingerprint, createdAt },
      })
    await db
      .delete(contentClusterMembersTable)
      .where(eq(contentClusterMembersTable.entryId, entryId))
  }

  async setManualRepresentative(clusterId: string, entryId: string | null, updatedAt: number) {
    await db
      .update(contentClustersTable)
      .set({ manualRepresentativeEntryId: entryId, updatedAt })
      .where(eq(contentClustersTable.id, clusterId))
  }

  async removeMembers(entryIds: string[]) {
    if (entryIds.length === 0) return
    await db
      .delete(contentClusterMembersTable)
      .where(inArray(contentClusterMembersTable.entryId, entryIds))
  }
}

export const ContentClusterService = new ContentClusterServiceStatic()
