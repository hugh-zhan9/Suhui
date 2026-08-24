import { eq, inArray } from "drizzle-orm"

import { db } from "../db"
import { translationsTable } from "../schemas"
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

  async purgeExpiredTranslations() {
    const translations = await db.query.translationsTable.findMany()
    const translationsToClean = translations.filter(
      (translation) =>
        new Date(translation.createdAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    )
    if (translationsToClean.length === 0) return 0
    await db.delete(translationsTable).where(
      inArray(
        translationsTable.entryId,
        translationsToClean.map((t) => t.entryId),
      ),
    )
    return translationsToClean.length
  }

  async purgeAllForMaintenance() {
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

  async replaceTranslation(data: Omit<TranslationSchema, "createdAt">) {
    const createdAt = new Date().toISOString()
    await db
      .insert(translationsTable)
      .values({ ...data, createdAt })
      .onConflictDoUpdate({
        target: [translationsTable.entryId, translationsTable.language],
        set: {
          title: data.title ?? null,
          description: data.description ?? null,
          content: data.content ?? null,
          readabilityContent: data.readabilityContent ?? null,
          sourceHash: data.sourceHash ?? null,
          configHash: data.configHash ?? null,
          createdAt,
        },
      })
  }

  async purgeByEntryIdForMaintenance(entryId: string) {
    await db.delete(translationsTable).where(eq(translationsTable.entryId, entryId))
  }
}

export const TranslationService = new TranslationServiceStatic()
