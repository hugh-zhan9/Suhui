import { beforeEach, describe, expect, it, vi } from "vitest"

const start = vi.fn()
const stop = vi.fn()
const getStatus = vi.fn()
const info = vi.fn()
const error = vi.fn()

vi.mock("./manager", () => ({
  RemoteServerManager: {
    start,
    stop,
    getStatus,
  },
}))

vi.mock("~/logger", () => ({
  logger: {
    info,
    error,
  },
}))

describe("initializeRemoteAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts remote access and logs the listening address", async () => {
    start.mockResolvedValue({
      running: true,
      host: "0.0.0.0",
      port: 41595,
      baseUrl: "http://0.0.0.0:41595",
    })

    const { initializeRemoteAccess } = await import("./lifecycle")

    await initializeRemoteAccess()

    expect(start).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith("[Remote] server started", {
      running: true,
      host: "0.0.0.0",
      port: 41595,
      baseUrl: "http://0.0.0.0:41595",
    })
  })

  it("logs startup failures without throwing", async () => {
    start.mockRejectedValue(new Error("listen EADDRINUSE"))
    getStatus.mockReturnValue({
      running: false,
      host: null,
      port: null,
      baseUrl: null,
    })

    const { initializeRemoteAccess } = await import("./lifecycle")

    await expect(initializeRemoteAccess()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith("[Remote] failed to start server", {
      error: "listen EADDRINUSE",
      status: {
        running: false,
        host: null,
        port: null,
        baseUrl: null,
      },
    })
  })

  it("stops remote access and logs shutdown", async () => {
    stop.mockResolvedValue(undefined)

    const { shutdownRemoteAccess } = await import("./lifecycle")

    await shutdownRemoteAccess()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith("[Remote] server stopped")
  })
})
