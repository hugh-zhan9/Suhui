/**
 * 远程端 Store 初始化
 * 从 HTTP API 加载订阅、未读数据并填充 store，启动 SSE 连接
 */

import { feedActions } from "../modules/feed/store"
import type { UnreadSchema } from "../../../database/src/schemas/types"
import { subscriptionActions } from "../modules/subscription/store"
import { unreadActions } from "../modules/unread/store"
import { runtimeClient } from "../runtime"
import { getRuntimeEnv } from "./env"
import { remoteSSEHandler } from "./sse-handler"
import { transformUnreadsFromApi } from "./transforms"

export type RemoteHydrateStatus = {
  phase: "idle" | "loading" | "ready" | "error"
  error?: string
  subscriptionsLoaded: number
  unreadLoaded: number
}

type RemoteHydrateOptions = {
  onStatusChange?: (status: RemoteHydrateStatus) => void
  loadEntries?: boolean
  initialFeedId?: string
}

/**
 * 从远程 API 初始化 Store
 */
export const hydrateFromRemote = async (options?: RemoteHydrateOptions): Promise<void> => {
  const { isRemote } = getRuntimeEnv()
  if (!isRemote) {
    console.warn("[hydrateFromRemote] Not in remote environment, skip hydration")
    return
  }

  const status: RemoteHydrateStatus = {
    phase: "loading",
    subscriptionsLoaded: 0,
    unreadLoaded: 0,
  }
  options?.onStatusChange?.(status)

  try {
    const [subscriptionsResult, unreadData] = await Promise.all([
      runtimeClient.subscriptions.list(undefined, { subscriptions: [], feeds: [] }),
      runtimeClient.unread.list(),
    ])

    // 转换并填充订阅
    const subscriptions = subscriptionsResult.subscriptions
    subscriptionActions.replaceManyInSession(subscriptions)
    status.subscriptionsLoaded = subscriptions.length

    // 提取并填充 Feed 信息
    const feeds = subscriptionsResult.feeds
    if (feeds.length > 0) {
      feedActions.upsertManyInSession(feeds as any)
    }

    // 转换并填充未读数据
    const unreads = transformUnreadsFromApi(unreadData || [])
    unreadActions.upsertManyInSession(unreads as unknown as UnreadSchema[])
    status.unreadLoaded = unreads.length

    // 可选：加载初始条目
    if (options?.loadEntries && options.initialFeedId) {
      await loadInitialEntries(options.initialFeedId)
    }

    // 启动 SSE 连接
    remoteSSEHandler.connect()

    status.phase = "ready"
    options?.onStatusChange?.(status)

    console.log(
      `[hydrateFromRemote] Hydration complete: ${status.subscriptionsLoaded} subscriptions, ${status.unreadLoaded} unread counts`,
    )
  } catch (error) {
    status.phase = "error"
    status.error = error instanceof Error ? error.message : String(error)
    options?.onStatusChange?.(status)

    console.error("[hydrateFromRemote] Hydration failed:", error)
    throw error
  }
}

/**
 * 加载初始条目数据
 */
const loadInitialEntries = async (feedId: string): Promise<void> => {
  try {
    const entries = await runtimeClient.entries.list({ feedId })

    // 动态导入 entryActions 避免循环依赖
    const { entryActions } = await import("../modules/entry/store")
    entryActions.upsertManyInSession(entries)
  } catch (error) {
    console.error("[loadInitialEntries] Failed to load initial entries:", error)
  }
}

/**
 * 重置远程端 Store
 */
export const resetRemoteStore = (): void => {
  subscriptionActions.reset()
  feedActions.reset()
  unreadActions.reset()

  // 断开 SSE
  remoteSSEHandler.disconnect()
}
