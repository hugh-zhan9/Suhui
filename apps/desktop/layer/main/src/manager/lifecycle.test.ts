import { describe, expect, it, vi } from "vitest"

type Listener = (...args: any[]) => void

const loadLifecycleWithMocks = (isReadyValue: boolean) => {
  const listeners = new Map<string, Listener>()
  const onceListeners = new Map<string, Listener>()

  const appMock = {
    on: vi.fn((event: string, cb: Listener) => {
      listeners.set(event, cb)
      return appMock
    }),
    once: vi.fn((event: string, cb: Listener) => {
      onceListeners.set(event, cb)
      return appMock
    }),
    isReady: vi.fn(() => isReadyValue),
    quit: vi.fn(),
  }

  const show = vi.fn()
  const focus = vi.fn()
  const getMainWindowOrCreate = vi.fn(() => ({ show, focus }))

  vi.doMock("electron", () => ({
    app: appMock,
  }))
  vi.doMock("~/manager/window", () => ({
    WindowManager: {
      getMainWindowOrCreate,
    },
  }))

  return { appMock, listeners, onceListeners, show, focus, getMainWindowOrCreate }
}

describe("LifecycleManager activate", () => {
  it("should defer creating window until app ready", async () => {
    vi.resetModules()
    const ctx = loadLifecycleWithMocks(false)
    await import("./lifecycle")

    const onActivate = ctx.listeners.get("activate")
    expect(onActivate).toBeTypeOf("function")

    onActivate?.()
    expect(ctx.getMainWindowOrCreate).not.toHaveBeenCalled()
    expect(ctx.appMock.once).toHaveBeenCalledWith("ready", expect.any(Function))

    const onReady = ctx.onceListeners.get("ready")
    onReady?.()
    expect(ctx.getMainWindowOrCreate).toHaveBeenCalledTimes(1)
    expect(ctx.show).toHaveBeenCalledTimes(1)
    expect(ctx.focus).toHaveBeenCalledTimes(1)
  })

  it("should create and focus window immediately when app is ready", async () => {
    vi.resetModules()
    const ctx = loadLifecycleWithMocks(true)
    await import("./lifecycle")

    const onActivate = ctx.listeners.get("activate")
    expect(onActivate).toBeTypeOf("function")

    onActivate?.()
    expect(ctx.getMainWindowOrCreate).toHaveBeenCalledTimes(1)
    expect(ctx.show).toHaveBeenCalledTimes(1)
    expect(ctx.focus).toHaveBeenCalledTimes(1)
    expect(ctx.appMock.once).not.toHaveBeenCalled()
  })
})
