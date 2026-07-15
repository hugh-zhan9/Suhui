import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createDeferredCommandRunner,
  createFollowCommandManager,
  type CommandImplementation,
} from "./command-manager"
import { CommandRegistry, registerCommand } from "./registry/registry"

const testCommandId = "test:deferred-handoff"
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe("FollowCommandManager lifecycle", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    CommandRegistry.commands.delete(testCommandId)
    vi.restoreAllMocks()
  })

  it("keeps invocations exactly once through chunk resolution and real registration", async () => {
    const chunk = deferred<CommandImplementation>()
    const realRun = vi.fn()
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const observedRegistryPhases: string[] = []
    let invokedDuringRender = false

    const Implementation: CommandImplementation = ({ onReady }) => {
      if (!invokedDuringRender) {
        invokedDuringRender = true
        observedRegistryPhases.push(
          CommandRegistry.get(testCommandId) ? "render:present" : "render:missing",
        )
        CommandRegistry.get(testCommandId)?.run("during-render")
      }

      useEffect(
        () =>
          registerCommand({
            id: testCommandId,
            label: "Test command",
            run: realRun,
          }),
        [],
      )
      useEffect(() => {
        observedRegistryPhases.push(
          CommandRegistry.get(testCommandId) ? "registered:present" : "registered:missing",
        )
        CommandRegistry.get(testCommandId)?.run("after-registration")
      }, [])
      useEffect(onReady, [onReady])
      return null
    }
    const Manager = createFollowCommandManager({
      implementationLoader: () => chunk.promise,
      ids: [testCommandId],
    })

    await act(async () => root.render(createElement(Manager)))
    CommandRegistry.get(testCommandId)?.run("while-loading")

    await act(async () => chunk.resolve(Implementation))

    await vi.waitFor(() => {
      expect(realRun).toHaveBeenCalledTimes(3)
    })
    expect(realRun.mock.calls).toEqual([
      ["after-registration"],
      ["while-loading"],
      ["during-render"],
    ])
    expect(observedRegistryPhases).toEqual(["render:present", "registered:present"])
    expect(consoleWarn).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    expect(CommandRegistry.commands.has(testCommandId)).toBe(false)
    root = createRoot(container)
  })

  it("keeps the mounted proxy visible and retryable after a chunk failure", async () => {
    const firstChunk = deferred<CommandImplementation>()
    const secondChunk = deferred<CommandImplementation>()
    const realRun = vi.fn()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const implementationLoader = vi
      .fn<() => Promise<CommandImplementation>>()
      .mockReturnValueOnce(firstChunk.promise)
      .mockReturnValueOnce(secondChunk.promise)
    const Implementation: CommandImplementation = ({ onReady }) => {
      useEffect(
        () =>
          registerCommand({
            id: testCommandId,
            label: "Test command",
            run: realRun,
          }),
        [],
      )
      useEffect(onReady, [onReady])
      return null
    }
    const Manager = createFollowCommandManager({ implementationLoader, ids: [testCommandId] })

    await act(async () => root.render(createElement(Manager)))
    CommandRegistry.get(testCommandId)?.run("failed-attempt")
    await act(async () => firstChunk.reject(new Error("chunk unavailable")))
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to load command ${testCommandId}`),
        expect.any(Error),
      ),
    )
    expect(CommandRegistry.get(testCommandId)).toBeDefined()

    CommandRegistry.get(testCommandId)?.run("retry")
    await act(async () => secondChunk.resolve(Implementation))

    await vi.waitFor(() => expect(realRun).toHaveBeenCalledOnce())
    expect(realRun).toHaveBeenCalledWith("retry")
    expect(implementationLoader).toHaveBeenCalledTimes(2)
  })
})

describe("deferred command runner", () => {
  it("loads on first invocation, waits for registration, then executes", async () => {
    let finishLoading: (() => void) | undefined
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLoading = resolve
        }),
    )
    const run = vi.fn(() => "done")
    const resolve = vi.fn(() => ({ run }) as any)
    const deferred = createDeferredCommandRunner({ load, resolve })

    expect(load).not.toHaveBeenCalled()
    const result = deferred("entry:read", ["entry-1"])
    expect(load).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()

    finishLoading?.()
    await expect(result).resolves.toBe("done")
    expect(run).toHaveBeenCalledWith("entry-1")
  })

  it("retries the implementation load after a failure", async () => {
    const load = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce()
    const run = vi.fn()
    const deferred = createDeferredCommandRunner({
      load,
      resolve: () => ({ run }) as any,
    })

    await expect(deferred("entry:read", [])).rejects.toThrow("chunk unavailable")
    await expect(deferred("entry:read", [])).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledOnce()
  })
})
