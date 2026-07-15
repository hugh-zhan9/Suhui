import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useStartupFrameDeferredMount } from "./useStartupFrameDeferredMount"

const MountProbe = ({
  inElectron,
  ready,
  terminalError = false,
  startupSessionId = "session-1",
}: {
  inElectron: boolean
  ready: boolean
  terminalError?: boolean
  startupSessionId?: string
}) => {
  const shouldMount = useStartupFrameDeferredMount({
    inElectron,
    desktopInitialEntriesReady: ready,
    desktopInitialEntriesTerminalError: terminalError,
    startupSessionId,
  })
  return shouldMount ? <div data-testid="mounted" /> : null
}

describe("useStartupFrameDeferredMount", () => {
  let container: HTMLDivElement
  let root: Root | null
  let nextFrameId: number
  let frameCallbacks: Map<number, FrameRequestCallback>
  let cancelAnimationFrameMock: ReturnType<typeof vi.fn>

  const render = async (props: {
    inElectron: boolean
    ready: boolean
    terminalError?: boolean
    startupSessionId?: string
  }) => {
    await act(async () => root?.render(<MountProbe {...props} />))
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    nextFrameId = 1
    frameCallbacks = new Map()
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        const frameId = nextFrameId++
        frameCallbacks.set(frameId, callback)
        return frameId
      }),
    )
    cancelAnimationFrameMock = vi.fn((frameId: number) => frameCallbacks.delete(frameId))
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount())
    }
    container.remove()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
  })

  it("waits on Electron startup while initial entries are not ready", async () => {
    await render({ inElectron: true, ready: false })

    expect(container.querySelector('[data-testid="mounted"]')).toBeNull()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it("mounts on the frame after Electron initial entries become ready", async () => {
    await render({ inElectron: true, ready: false })
    await render({ inElectron: true, ready: true })
    expect(container.querySelector('[data-testid="mounted"]')).toBeNull()

    const callback = frameCallbacks.values().next().value
    await act(async () => callback?.(performance.now()))

    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()
  })

  it("mounts on the frame after Electron initial entries reach a terminal error", async () => {
    await render({ inElectron: true, ready: false })
    await render({ inElectron: true, ready: false, terminalError: true })
    expect(container.querySelector('[data-testid="mounted"]')).toBeNull()

    const callback = frameCallbacks.values().next().value
    await act(async () => callback?.(performance.now()))

    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()
  })

  it("defers an initial Electron terminal error until the next frame", async () => {
    await render({ inElectron: true, ready: false, terminalError: true })

    expect(container.querySelector('[data-testid="mounted"]')).toBeNull()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    const callback = frameCallbacks.values().next().value
    await act(async () => callback?.(performance.now()))

    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()
  })

  it("mounts immediately when Electron initial entries were already ready", async () => {
    await render({ inElectron: true, ready: true })

    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it("mounts immediately outside Electron", async () => {
    await render({ inElectron: false, ready: false })

    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it("hides a settled first session while a second session is unresolved", async () => {
    await render({ inElectron: true, ready: false, startupSessionId: "session-1" })
    await render({ inElectron: true, ready: true, startupSessionId: "session-1" })
    const firstSessionFrame = frameCallbacks.values().next().value
    await act(async () => firstSessionFrame?.(performance.now()))
    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()

    await render({ inElectron: true, ready: false, startupSessionId: "session-2" })
    expect(container.querySelector('[data-testid="mounted"]')).toBeNull()

    await render({
      inElectron: true,
      ready: false,
      terminalError: true,
      startupSessionId: "session-2",
    })
    expect(container.querySelector('[data-testid="mounted"]')).toBeNull()
    const secondSessionFrame = frameCallbacks.values().next().value
    await act(async () => secondSessionFrame?.(performance.now()))
    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()
  })

  it("mounts immediately when a new Electron session is already ready", async () => {
    await render({ inElectron: true, ready: true, startupSessionId: "session-1" })
    await render({ inElectron: true, ready: true, startupSessionId: "session-2" })

    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it("cancels the prior session pending frame when the session changes", async () => {
    await render({ inElectron: true, ready: false, startupSessionId: "session-1" })
    await render({
      inElectron: true,
      ready: false,
      terminalError: true,
      startupSessionId: "session-1",
    })
    const priorFrameId = frameCallbacks.keys().next().value

    await render({ inElectron: true, ready: false, startupSessionId: "session-2" })

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(priorFrameId)
    expect(frameCallbacks).toHaveLength(0)
    expect(container.querySelector('[data-testid="mounted"]')).toBeNull()
  })

  it("cancels the pending frame on cleanup", async () => {
    await render({ inElectron: true, ready: false })
    await render({ inElectron: true, ready: true })
    const frameId = frameCallbacks.keys().next().value

    await act(async () => root?.unmount())
    root = null

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(frameId)
    expect(frameCallbacks).toHaveLength(0)
  })
})
