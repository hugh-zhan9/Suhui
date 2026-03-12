import type { EntrySchema, SubscriptionSchema } from "@follow/database/schemas/types"

import type { EntryModel } from "../modules/entry/types"
import type { SubscriptionModel } from "../modules/subscription/types"

type EntryRow = Omit<EntrySchema, "insertedAt" | "publishedAt" | "readabilityUpdatedAt"> & {
  insertedAt: number | Date
  publishedAt: number | Date
  readabilityUpdatedAt?: number | Date | null
}

class DbStoreMorph {
  toSubscriptionModel(subscription: SubscriptionSchema): SubscriptionModel {
    return subscription
  }

  toEntryModel(entry: EntryRow): EntryModel {
    const normalizeRequiredTime = (value: Date | number | null | undefined) => {
      if (value === null || value === undefined) return Date.now()
      return value instanceof Date ? value.getTime() : value
    }
    const normalizeOptionalTime = (value: Date | number | null | undefined) => {
      if (value === null || value === undefined) return null
      return value instanceof Date ? value.getTime() : value
    }

    return {
      ...entry,
      insertedAt: normalizeRequiredTime(entry.insertedAt),
      publishedAt: normalizeRequiredTime(entry.publishedAt),
      readabilityUpdatedAt: normalizeOptionalTime(entry.readabilityUpdatedAt),
    }
  }
}

export const dbStoreMorph = new DbStoreMorph()
