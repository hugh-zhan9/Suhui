type HydratePhase = "idle" | "interactive" | "deferred" | "ready"

type HydrateBarrierState = {
  phase: HydratePhase
  startupSessionId: string | null
  currentSource: "snapshot_restore" | "hydrate_critical" | "hydrate_deferred" | "user_write" | null
  reconcileConflictCount: number
  dirtyEntryReadIds: Set<string>
  dirtyUnreadIds: Set<string>
  dirtySubscriptionIds: Set<string>
  dirtyFeedIds: Set<string>
}

const createBarrierState = (): HydrateBarrierState => ({
  phase: "idle",
  startupSessionId: null,
  currentSource: null,
  reconcileConflictCount: 0,
  dirtyEntryReadIds: new Set(),
  dirtyUnreadIds: new Set(),
  dirtySubscriptionIds: new Set(),
  dirtyFeedIds: new Set(),
})

let hydrateBarrierState = createBarrierState()

const isCriticalHydrateBarrierActive = () => hydrateBarrierState.phase === "interactive"

export const startHydrateInteractive = (startupSessionId?: string) => {
  hydrateBarrierState = createBarrierState()
  hydrateBarrierState.phase = "interactive"
  hydrateBarrierState.startupSessionId = startupSessionId ?? null
}

export const markHydrateCriticalDone = () => {
  hydrateBarrierState.dirtyEntryReadIds.clear()
  hydrateBarrierState.dirtyUnreadIds.clear()
  hydrateBarrierState.dirtySubscriptionIds.clear()
  hydrateBarrierState.dirtyFeedIds.clear()
  hydrateBarrierState.phase = "deferred"
  hydrateBarrierState.currentSource = null
}

export const markHydrateReady = () => {
  hydrateBarrierState.phase = "ready"
  hydrateBarrierState.currentSource = null
}

export const resetHydratePhases = () => {
  hydrateBarrierState = createBarrierState()
}

export const getHydratePhaseState = () => ({
  phase: hydrateBarrierState.phase,
  startupSessionId: hydrateBarrierState.startupSessionId,
  currentSource: hydrateBarrierState.currentSource,
  barrierActive: isCriticalHydrateBarrierActive(),
  reconcileConflictCount: hydrateBarrierState.reconcileConflictCount,
  dirtyEntryReadIds: new Set(hydrateBarrierState.dirtyEntryReadIds),
  dirtyUnreadIds: new Set(hydrateBarrierState.dirtyUnreadIds),
  dirtySubscriptionIds: new Set(hydrateBarrierState.dirtySubscriptionIds),
  dirtyFeedIds: new Set(hydrateBarrierState.dirtyFeedIds),
})

export const runWithHydrateSource = <T>(
  source: HydrateBarrierState["currentSource"],
  fn: () => T,
): T => {
  const previousSource = hydrateBarrierState.currentSource
  hydrateBarrierState.currentSource = source
  try {
    return fn()
  } finally {
    hydrateBarrierState.currentSource = previousSource
  }
}

const recordReconcileConflict = () => {
  hydrateBarrierState.reconcileConflictCount += 1
}

export const markEntryReadHydrateDirty = (entryId?: string | null) => {
  if (!isCriticalHydrateBarrierActive() || !entryId) return
  hydrateBarrierState.dirtyEntryReadIds.add(entryId)
}

export const markUnreadHydrateDirty = (id?: string | null) => {
  if (!isCriticalHydrateBarrierActive() || !id) return
  hydrateBarrierState.dirtyUnreadIds.add(id)
}

export const markSubscriptionHydrateDirty = (subscriptionId?: string | null) => {
  if (!isCriticalHydrateBarrierActive() || !subscriptionId) return
  hydrateBarrierState.dirtySubscriptionIds.add(subscriptionId)
}

export const markFeedHydrateDirty = (feedId?: string | null) => {
  if (!isCriticalHydrateBarrierActive() || !feedId) return
  hydrateBarrierState.dirtyFeedIds.add(feedId)
}

type EntryReadModel = {
  id: string
  read?: boolean | null
}

type UnreadCountModel = {
  id: string
  count: number
}

type SubscriptionCoveredModel = {
  feedId?: string | null
  listId?: string | null
  inboxId?: string | null
  title?: string | null
  category?: string | null
  hideFromTimeline?: boolean | null
  isPrivate?: boolean | null
  view?: number | null
}

type FeedCoveredModel = {
  id?: string | null
  title?: string | null
}

export const reconcileHydratedEntry = <T extends EntryReadModel>(incoming: T, current?: T): T => {
  if (
    !isCriticalHydrateBarrierActive() ||
    !current?.id ||
    !hydrateBarrierState.dirtyEntryReadIds.has(current.id)
  ) {
    return incoming
  }

  recordReconcileConflict()
  return {
    ...incoming,
    read: current.read,
  }
}

export const reconcileHydratedUnread = <T extends UnreadCountModel>(
  incoming: T,
  current?: T,
): T => {
  if (
    !isCriticalHydrateBarrierActive() ||
    !current?.id ||
    !hydrateBarrierState.dirtyUnreadIds.has(current.id)
  ) {
    return incoming
  }

  recordReconcileConflict()
  return {
    ...incoming,
    count: current.count,
  }
}

export const reconcileHydratedSubscription = <T extends SubscriptionCoveredModel>(
  incoming: T,
  current?: T,
): T => {
  const subscriptionBarrierId =
    current?.feedId ||
    incoming.feedId ||
    current?.listId ||
    incoming.listId ||
    current?.inboxId ||
    incoming.inboxId

  if (
    !isCriticalHydrateBarrierActive() ||
    !current ||
    !subscriptionBarrierId ||
    !hydrateBarrierState.dirtySubscriptionIds.has(subscriptionBarrierId)
  ) {
    return incoming
  }

  recordReconcileConflict()
  return {
    ...incoming,
    view: current.view ?? incoming.view,
    category: current.category ?? incoming.category,
    hideFromTimeline: current.hideFromTimeline ?? incoming.hideFromTimeline,
    isPrivate: current.isPrivate ?? incoming.isPrivate,
    title: current.title ?? incoming.title,
  }
}

export const reconcileHydratedFeed = <T extends FeedCoveredModel>(incoming: T, current?: T): T => {
  if (
    !isCriticalHydrateBarrierActive() ||
    !current?.id ||
    !hydrateBarrierState.dirtyFeedIds.has(current.id)
  ) {
    return incoming
  }

  recordReconcileConflict()
  return {
    ...incoming,
    title: current.title ?? incoming.title,
  }
}
