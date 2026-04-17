import { vi } from "vitest"

vi.mock("electron", () => ({
  session: {
    defaultSession: {
      resolveProxy: vi.fn(),
    },
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}))

vi.mock("~/lib/store", () => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock("~/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    waitUntilUsable: vi.fn(),
    getDB: vi.fn(),
    getDialect: vi.fn(),
  },
}))

vi.mock("~/manager/sync-applier", () => ({
  drainPendingOps: vi.fn(),
}))

vi.mock("~/manager/sync-logger", () => ({
  syncLogger: {
    record: vi.fn(),
  },
}))

vi.mock("~/manager/refresh-audit-log", () => ({
  appendRefreshAuditTrace: vi.fn(),
}))

vi.mock("~/manager/local-feed-refresh-events", () => ({
  broadcastLocalFeedRefreshCompleted: vi.fn(),
}))

import { describe, expect, it } from "vitest"
import { DbService } from "./db"

describe("DbService", () => {
  it("should expose preview and local refresh methods", () => {
    const service = new DbService()
    expect(service.previewFeed).toBeDefined()
    expect(service.refreshLocalSubscribedFeeds).toBeDefined()
  })
})
