import { collectionActions } from "../modules/collection/store"
import { feedActions, useFeedStore } from "../modules/feed/store"
import type { FeedModel } from "../modules/feed/types"
import { subscriptionActions } from "../modules/subscription/store"
import { unreadActions } from "../modules/unread/store"
import { createZustandStore } from "../lib/helper"
import { remoteSSEHandler } from "./sse-handler"
import {
  transformRemoteBootstrapFromApi,
  type CollectionRecord,
  type SubscriptionRecord,
  type UnreadRecord,
} from "./transforms"

export type RemoteSettings = {
  appearance: "light" | "dark" | "system"
  rsshubCustomUrl: string
}

export type RemoteBootstrapPayload = {
  subscriptions: SubscriptionRecord[]
  feeds: Array<Partial<FeedModel> & { id: string }>
  unread: UnreadRecord[]
  collections: CollectionRecord[]
  settings: RemoteSettings
  capabilities: unknown
}

export type RemoteBootstrapPhase = "loading" | "ready" | "error"

export type RemoteBootstrapState = {
  phase: RemoteBootstrapPhase
  error: string | null
  subscriptionsLoaded: number
  feedsLoaded: number
  unreadLoaded: number
  collectionsLoaded: number
  settings: RemoteSettings | null
  capabilities: unknown
}

const initialRemoteBootstrapState: RemoteBootstrapState = {
  phase: "loading",
  error: null,
  subscriptionsLoaded: 0,
  feedsLoaded: 0,
  unreadLoaded: 0,
  collectionsLoaded: 0,
  settings: null,
  capabilities: null,
}

export const useRemoteBootstrapStore = createZustandStore<RemoteBootstrapState>("remote-bootstrap")(
  () => initialRemoteBootstrapState,
)

export const beginRemoteBootstrapLoading = (): void => {
  useRemoteBootstrapStore.setState((state) => ({ ...state, phase: "loading", error: null }))
}

export const failRemoteBootstrapLoading = (error: unknown): void => {
  useRemoteBootstrapStore.setState((state) => ({
    ...state,
    phase: "error",
    error: error instanceof Error ? error.message : String(error),
  }))
}

export const applyRemoteBootstrapInSession = (
  payload: RemoteBootstrapPayload,
): RemoteBootstrapState => {
  const transformed = transformRemoteBootstrapFromApi(payload)
  const readyState: RemoteBootstrapState = {
    phase: "ready",
    error: null,
    subscriptionsLoaded: transformed.subscriptions.length,
    feedsLoaded: transformed.feeds.length,
    unreadLoaded: transformed.unread.length,
    collectionsLoaded: transformed.collections.length,
    settings: transformed.settings,
    capabilities: transformed.capabilities,
  }

  subscriptionActions.replaceManyInSession(transformed.subscriptions)
  feedActions.restoreHydratedSnapshotInSession(
    transformed.feeds as Parameters<typeof feedActions.restoreHydratedSnapshotInSession>[0],
  )
  unreadActions.upsertManyInSession(transformed.unread, {
    reset: true,
    source: "runtime",
  })
  collectionActions.upsertManyInSession(transformed.collections, { reset: true })
  useRemoteBootstrapStore.setState(readyState)
  return readyState
}

export const resetRemoteBootstrapStores = (): void => {
  subscriptionActions.replaceManyInSession([])
  useFeedStore.setState({ feeds: {} })
  unreadActions.upsertManyInSession([], { reset: true, source: "runtime" })
  collectionActions.upsertManyInSession([], { reset: true })
  useRemoteBootstrapStore.setState(initialRemoteBootstrapState)
  remoteSSEHandler.disconnect()
}
