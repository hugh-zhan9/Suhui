import { initializeDB, migrateDB } from "@suhui/database/db"

import type { Hydratable } from "./lib/base"
import { markHydrateCriticalDone, markHydrateReady, resetHydratePhases } from "./hydrate-phases"
import { collectionActions } from "./modules/collection/store"
import { entryActions } from "./modules/entry/store"
import { feedActions } from "./modules/feed/store"
import { imageActions } from "./modules/image/store"
import { inboxActions } from "./modules/inbox/store"
import { listActions } from "./modules/list/store"
import { subscriptionActions } from "./modules/subscription/store"
import { summaryActions } from "./modules/summary/store"
import { translationActions } from "./modules/translation/store"
import { unreadActions } from "./modules/unread/store"
import { userActions } from "./modules/user/store"

const criticalHydrates: Hydratable[] = [
  feedActions,
  subscriptionActions,
  userActions,
  entryActions,
  unreadActions,
]

const deferredHydrates: Hydratable[] = [
  inboxActions,
  listActions,
  collectionActions,
  summaryActions,
  translationActions,
  imageActions,
]

export const hydrateDatabaseToStore = async (options?: { migrateDatabase?: boolean }) => {
  if (options?.migrateDatabase) {
    await initializeDB()
    await migrateDB()
  }
  await hydrateCriticalToStore()
  void hydrateDeferredToStore()
}

export const hydrateCriticalToStore = async (options?: { migrateDatabase?: boolean }) => {
  if (options?.migrateDatabase) {
    await initializeDB()
    await migrateDB()
  }
  try {
    for (const hydrate of criticalHydrates) {
      await hydrate.hydrate()
    }
  } catch (error) {
    resetHydratePhases()
    throw error
  }

  markHydrateCriticalDone()
}

export const hydrateDeferredToStore = async () => {
  try {
    await Promise.all(deferredHydrates.map((hydrate) => hydrate.hydrate()))
    markHydrateReady()
    return true
  } catch (error) {
    console.error("[store] deferred hydrate failed", error)
    return false
  }
}
