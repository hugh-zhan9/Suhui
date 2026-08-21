import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp"),
    getVersion: vi.fn(() => "1.0.0"),
    getAppPath: vi.fn(() => "/tmp"),
    getLoginItemSettings: vi.fn(() => ({ wasOpenedAsHidden: false })),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  clipboard: {
    readText: vi.fn(() => ""),
  },
  dialog: {},
  shell: {},
}))

vi.mock("@suhui/shared/constants", () => ({
  DEV: false,
  MODE: "production",
  ModeEnum: {
    production: "production",
    development: "development",
    staging: "staging",
  },
}))

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => () => undefined,
  IpcService: class {},
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    getEffectiveConfig: vi.fn(() => ({
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/current",
      dbUser: "current-user",
      dbPassword: "current-password",
      source: "env",
    })),
    getDefaultSqlitePath: vi.fn(() => "/tmp/suhui.db"),
    getStatus: vi.fn(() => ({})),
    switchDatabase: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("~/manager/db-config-view", () => ({
  buildDbConfigView: vi.fn(() => ({
    dbType: "postgres",
    dbConn: "127.0.0.1:5432/current",
    dbUser: "current-user",
    dbPasswordMasked: "***",
    effectiveSource: "env",
    overrideActive: false,
    envSource: "/tmp/.env",
    envCandidates: ["/tmp/.env"],
  })),
}))

vi.mock("~/manager/env-loader", () => ({
  getDesktopEnvInfo: vi.fn(() => ({
    active: "/tmp/.env",
    candidates: ["/tmp/.env"],
  })),
}))

vi.mock("~/lib/store", () => ({
  StoreKey: {
    DbConfigOverride: "dbConfigOverride",
  },
  store: {
    get: vi.fn(() => null),
  },
}))

vi.mock("~/manager/app", () => ({
  AppManager: {},
}))

vi.mock("~/manager/window", () => ({
  WindowManager: {},
}))

vi.mock("~/updater/hot-updater", () => ({
  cleanupOldRender: vi.fn(),
  loadDynamicRenderEntry: vi.fn(),
}))

vi.mock("~/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  revealLogFile: vi.fn(),
}))

vi.mock("../../lib/download", () => ({
  downloadFile: vi.fn(),
}))

vi.mock("./ready-to-show", () => ({
  shouldShowMainWindowOnReady: vi.fn(() => true),
}))

import { DBManager } from "~/manager/db"

import { AppService } from "./app"

describe("AppService database switch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reuses the current password when dbPassword is omitted", async () => {
    const service = new AppService()

    await service.switchDbConfig({} as any, {
      dbConn: "127.0.0.1:5432/next",
      dbUser: "next-user",
    })

    // 这个表单只改连接参数，不改方言：缺省 dbType 会被
    // normalizeDbConfigOverride 一律当成 postgres，sqlite 用户会被静默切库。
    expect(DBManager.switchDatabase).toHaveBeenCalledWith({
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/next",
      dbUser: "next-user",
      dbPassword: "current-password",
    })
  })

  it("保留当前方言，不因表单缺少 dbType 而切库", async () => {
    vi.mocked(DBManager.getEffectiveConfig).mockReturnValueOnce({
      dbType: "sqlite",
      dbConn: "/tmp/suhui.db",
      dbUser: "",
      dbPassword: "",
      source: "store-override",
    })
    const service = new AppService()

    await service.switchDbConfig({} as any, { dbConn: "/tmp/moved.db" })

    expect(DBManager.switchDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ dbType: "sqlite", dbConn: "/tmp/moved.db" }),
    )
  })

  it("allows clearing runtime override back to env defaults", async () => {
    const service = new AppService()

    await service.resetDbConfigOverride({} as any)

    expect(DBManager.switchDatabase).toHaveBeenCalledWith(null)
  })
})
