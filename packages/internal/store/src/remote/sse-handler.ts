/**
 * 远程端 SSE 事件处理器
 * 管理 SSE 连接、监听服务端事件、更新 Store
 */

import { queryClient } from "../context"
import type { UnreadSchema } from "../../../database/src/schemas/types"
import { feedActions } from "../modules/feed/store"
import { subscriptionActions } from "../modules/subscription/store"
import { unreadActions } from "../modules/unread/store"
import { getRuntimeEnv } from "./env"
import {
  extractFeedsFromSubscriptions,
  transformSubscriptionsFromApi,
  transformUnreadsFromApi,
  type SubscriptionRecord,
  type UnreadRecord,
} from "./transforms"

type SSEEventHandler = {
  onSubscriptionsUpdated?: () => void
  onEntriesUpdated?: (feedId?: string) => void
  onConnectionChange?: (connected: boolean) => void
}

class RemoteSSEHandler {
  private eventSource: EventSource | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 3000
  private handlers: SSEEventHandler = {}
  private isConnecting = false

  /**
   * 建立 SSE 连接
   */
  connect(): void {
    const { isRemote } = getRuntimeEnv()
    if (!isRemote) {
      console.warn("[RemoteSSEHandler] Not in remote environment, skip SSE connection")
      return
    }

    if (this.eventSource || this.isConnecting) {
      return
    }

    this.isConnecting = true

    try {
      this.eventSource = new EventSource("/events")

      this.eventSource.addEventListener("ready", () => {
        console.log("[RemoteSSEHandler] Connected")
        this.reconnectAttempts = 0
        this.isConnecting = false
        this.handlers.onConnectionChange?.(true)
      })

      this.eventSource.addEventListener("ping", () => {
        // 心跳事件，无需处理
      })

      this.eventSource.addEventListener("subscriptions.updated", () => {
        console.log("[RemoteSSEHandler] Received subscriptions.updated")
        this.handleSubscriptionsUpdated()
      })

      this.eventSource.addEventListener("entries.updated", (event) => {
        console.log("[RemoteSSEHandler] Received entries.updated")
        try {
          const payload = JSON.parse(event.data || "{}") as { feedId?: string }
          this.handleEntriesUpdated(payload.feedId)
        } catch (e) {
          this.handleEntriesUpdated()
        }
      })

      this.eventSource.onerror = (error) => {
        console.error("[RemoteSSEHandler] SSE error:", error)
        this.isConnecting = false
        this.handleConnectionError()
      }
    } catch (error) {
      console.error("[RemoteSSEHandler] Failed to create EventSource:", error)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  /**
   * 断开 SSE 连接
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    this.isConnecting = false
    this.handlers.onConnectionChange?.(false)
  }

  /**
   * 设置事件处理器
   */
  setHandlers(handlers: SSEEventHandler): void {
    this.handlers = { ...this.handlers, ...handlers }
  }

  /**
   * 刷新订阅数据
   */
  async refreshSubscriptions(): Promise<void> {
    try {
      const response = await fetch("/api/subscriptions")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const { data } = (await response.json()) as { data: SubscriptionRecord[] }
      const subscriptions = transformSubscriptionsFromApi(data)
      const feeds = extractFeedsFromSubscriptions(data)

      subscriptionActions.replaceManyInSession(subscriptions)
      feedActions.upsertManyInSession(feeds as any)
      this.handlers.onSubscriptionsUpdated?.()
    } catch (error) {
      console.error("[RemoteSSEHandler] Failed to refresh subscriptions:", error)
    }
  }

  /**
   * 刷新未读数据
   */
  async refreshUnread(): Promise<void> {
    try {
      const response = await fetch("/api/unread")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const { data } = (await response.json()) as { data: UnreadRecord[] }
      const unreads = transformUnreadsFromApi(data)

      unreadActions.upsertManyInSession(unreads as unknown as UnreadSchema[])
    } catch (error) {
      console.error("[RemoteSSEHandler] Failed to refresh unread:", error)
    }
  }

  /**
   * 使条目查询缓存失效
   */
  invalidateEntriesQuery(feedId?: string): void {
    // 使所有 entries 查询失效
    queryClient().invalidateQueries({
      queryKey: ["entries"],
    })

    // 如果指定了 feedId，也使特定 feed 的查询失效
    if (feedId) {
      queryClient().invalidateQueries({
        queryKey: ["entries", feedId],
      })
    }

    this.handlers.onEntriesUpdated?.(feedId)
  }

  // ============ 私有方法 ============

  private handleSubscriptionsUpdated(): void {
    void this.refreshSubscriptions()
    void this.refreshUnread()
  }

  private handleEntriesUpdated(feedId?: string): void {
    this.invalidateEntriesQuery(feedId)
    void this.refreshUnread()
  }

  private handleConnectionError(): void {
    this.handlers.onConnectionChange?.(false)
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[RemoteSSEHandler] Max reconnect attempts reached")
      return
    }

    if (this.reconnectTimer) {
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5)

    console.log(`[RemoteSSEHandler] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.disconnect()
      this.connect()
    }, delay)
  }
}

/** 单例实例 */
export const remoteSSEHandler = new RemoteSSEHandler()
