import type { EntrySchema, SubscriptionSchema } from "@follow/database/schemas/types"

import type { EntryModel } from "../modules/entry/types"
import type { SubscriptionModel } from "../modules/subscription/types"

class DbStoreMorph {
  toSubscriptionModel(subscription: SubscriptionSchema): SubscriptionModel {
    return subscription
  }

  toEntryModel(entry: EntrySchema): EntryModel {
    return {
      ...entry,
      insertedAt: entry.insertedAt ? new Date(entry.insertedAt) : new Date(),
      publishedAt: entry.publishedAt ? new Date(entry.publishedAt) : new Date(),
      readabilityUpdatedAt: entry.readabilityUpdatedAt ? new Date(entry.readabilityUpdatedAt) : null,
    } as unknown as EntryModel
  }
}

export const dbStoreMorph = new DbStoreMorph()
