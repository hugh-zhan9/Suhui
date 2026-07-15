/**
 * 远程端 SSE 事件处理器
 * 管理 SSE 连接、监听服务端事件、更新 Store
 */

import { parseEntryChangeEventV1, type EntryChangeEventV1 } from "@suhui/shared/entry-change"

import { entryChangeInvalidationCoordinator } from "../modules/entry/change-invalidation"
import { runtimeClient } from "../runtime"
import { getRuntimeEnv } from "./env"

type SSEEventHandler = {
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
  private connected = false
  private needsReconnectCompensation = false

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
      this.eventSource = runtimeClient.events.connect()

      this.eventSource.addEventListener("ready", () => {
        console.log("[RemoteSSEHandler] Connected")
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }

        const shouldCompensate = this.needsReconnectCompensation
        this.needsReconnectCompensation = false
        this.reconnectAttempts = 0
        this.isConnecting = false
        this.setConnected(true)

        if (shouldCompensate) {
          void entryChangeInvalidationCoordinator.handleReconnect().catch(() => {
            console.error("[RemoteSSEHandler] Reconnect compensation failed")
          })
        }
      })

      this.eventSource.addEventListener("ping", () => {
        // 心跳事件，无需处理
      })

      this.eventSource.addEventListener("subscriptions.updated", (event) => {
        console.log("[RemoteSSEHandler] Received subscriptions.updated")
        this.handleEntryChangeEvent("subscriptions.updated", event)
      })

      this.eventSource.addEventListener("entries.updated", (event) => {
        console.log("[RemoteSSEHandler] Received entries.updated")
        this.handleEntryChangeEvent("entries.updated", event)
      })

      this.eventSource.onerror = () => {
        console.error("[RemoteSSEHandler] SSE connection error")
        this.isConnecting = false
        this.handleConnectionError()
      }
    } catch {
      console.error("[RemoteSSEHandler] Failed to create EventSource")
      this.isConnecting = false
      this.needsReconnectCompensation = true
      this.setConnected(false, true)
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
    this.reconnectAttempts = 0
    this.needsReconnectCompensation = false
    this.setConnected(false)
  }

  /**
   * 设置事件处理器
   */
  setHandlers(handlers: SSEEventHandler): void {
    this.handlers = { ...this.handlers, ...handlers }
    handlers.onConnectionChange?.(this.connected)
  }

  // ============ 私有方法 ============

  private parseEntryChangeEvent(
    eventName: "entries.updated" | "subscriptions.updated",
    event: Event,
  ): EntryChangeEventV1 | null {
    const data = (event as MessageEvent<unknown>).data
    if (typeof data !== "string") return null

    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      return null
    }

    const parsed = parseEntryChangeEventV1(payload)
    if (!parsed) return null
    if (eventName === "entries.updated") return parsed

    return parseEntryChangeEventV1({
      ...parsed,
      reason: "subscription",
      scope: "all",
      feedId: undefined,
    })
  }

  private handleEntryChangeEvent(
    eventName: "entries.updated" | "subscriptions.updated",
    event: Event,
  ): void {
    const change = this.parseEntryChangeEvent(eventName, event)
    if (!change) return

    void entryChangeInvalidationCoordinator.handle(change, "sse").catch(() => {
      console.error(`[RemoteSSEHandler] Failed to handle ${eventName}`)
    })
  }

  private setConnected(connected: boolean, notifyWhenUnchanged = false): void {
    if (this.connected === connected && !notifyWhenUnchanged) return
    this.connected = connected
    this.handlers.onConnectionChange?.(connected)
  }

  private handleConnectionError(): void {
    this.needsReconnectCompensation = true
    this.setConnected(false, true)
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
      this.eventSource?.close()
      this.eventSource = null
      this.isConnecting = false
      this.connect()
    }, delay)
  }
}

/** 单例实例 */
export const remoteSSEHandler = new RemoteSSEHandler()
