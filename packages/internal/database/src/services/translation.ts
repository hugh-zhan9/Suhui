import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "../db"
import { translationBatchesTable, translationsTable } from "../schemas"
import type { TranslationSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"

class TranslationServiceStatic implements Resetable {
  getTranslation(entryId: string, language: TranslationSchema["language"]) {
    return db.query.translationsTable.findFirst({
      where: (translation, { and, eq }) =>
        and(eq(translation.entryId, entryId), eq(translation.language, language)),
    })
  }

  getTranslationAll() {
    return db.query.translationsTable.findMany()
  }

  async getTranslationToHydrate() {
    return db.query.translationsTable.findMany()
  }

  getBatches(
    entryId: string,
    language: TranslationSchema["language"],
    sourceHash: string,
    planVersion: number,
  ) {
    return db
      .select()
      .from(translationBatchesTable)
      .where(
        and(
          eq(translationBatchesTable.entryId, entryId),
          eq(translationBatchesTable.language, language),
          eq(translationBatchesTable.sourceHash, sourceHash),
          eq(translationBatchesTable.planVersion, planVersion),
        ),
      )
  }

  async saveBatch(data: typeof translationBatchesTable.$inferInsert) {
    await db
      .insert(translationBatchesTable)
      .values(data)
      .onConflictDoUpdate({
        target: [
          translationBatchesTable.entryId,
          translationBatchesTable.language,
          translationBatchesTable.sourceHash,
          translationBatchesTable.planVersion,
          translationBatchesTable.target,
          translationBatchesTable.batchId,
        ],
        set: { values: data.values, configHash: data.configHash, updatedAt: data.updatedAt },
      })
  }

  async clearBatches(
    entryId: string,
    language: TranslationSchema["language"],
    sourceHash: string,
    target: "content" | "readabilityContent",
  ) {
    await db
      .delete(translationBatchesTable)
      .where(
        and(
          eq(translationBatchesTable.entryId, entryId),
          eq(translationBatchesTable.language, language),
          eq(translationBatchesTable.sourceHash, sourceHash),
          inArray(translationBatchesTable.target, ["title", target]),
        ),
      )
  }

  async purgeAllForMaintenance() {
    await db.delete(translationBatchesTable).execute()
    await db.delete(translationsTable).execute()
  }

  async reset() {
    await this.purgeAllForMaintenance()
  }

  async insertTranslation(data: Omit<TranslationSchema, "createdAt">) {
    const updateExceptEmpty = Object.fromEntries(
      Object.entries({
        title: data.title,
        description: data.description,
        content: data.content,
        readabilityContent: data.readabilityContent,
        sourceHash: data.sourceHash,
        configHash: data.configHash,
      }).filter(([_, value]) => !!value),
    )

    await db
      .insert(translationsTable)
      .values({
        ...data,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [translationsTable.entryId, translationsTable.language],
        set: updateExceptEmpty,
      })
  }

  async replaceTranslation(
    data: Omit<TranslationSchema, "createdAt">,
    readerTarget?: "content" | "readabilityContent",
  ) {
    const createdAt = new Date().toISOString()
    // A different target may finish concurrently. Preserve its current row value,
    // never the snapshot read before awaiting AI. A different source cannot be mixed.
    const preserve = (
      column: (typeof translationsTable)["description" | "content" | "readabilityContent"],
    ) => sql`
      CASE WHEN ${translationsTable.sourceHash} = ${data.sourceHash ?? null}
      THEN ${column} ELSE NULL END`
    await db
      .insert(translationsTable)
      .values({ ...data, createdAt })
      .onConflictDoUpdate({
        target: [translationsTable.entryId, translationsTable.language],
        set: {
          title: data.title ?? null,
          description: readerTarget
            ? preserve(translationsTable.description)
            : (data.description ?? null),
          content:
            readerTarget === "readabilityContent"
              ? preserve(translationsTable.content)
              : (data.content ?? null),
          readabilityContent:
            readerTarget === "content"
              ? preserve(translationsTable.readabilityContent)
              : (data.readabilityContent ?? null),
          sourceHash: data.sourceHash ?? null,
          configHash: data.configHash ?? null,
          createdAt,
        },
      })
  }

  async purgeByEntryIdForMaintenance(entryId: string) {
    await db.delete(translationBatchesTable).where(eq(translationBatchesTable.entryId, entryId))
    await db.delete(translationsTable).where(eq(translationsTable.entryId, entryId))
  }
}

export const TranslationService = new TranslationServiceStatic()
