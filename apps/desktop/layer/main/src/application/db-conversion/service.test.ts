import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const backupMocks = {
  exportToFile: vi.fn(),
  prepareReplace: vi.fn(),
  restoreFromFile: vi.fn(),
}

vi.mock("~/application/backup/service", () => ({
  backupApplicationService: backupMocks,
}))

const DEFAULT_SQLITE_PATH = "/Users/me/Library/Application Support/溯洄/suhui.db"

const dbMocks = {
  beginMaintenance: vi.fn(),
  getDefaultSqlitePath: vi.fn(() => DEFAULT_SQLITE_PATH),
  getEffectiveConfig: vi.fn(),
  switchDatabase: vi.fn(),
}

vi.mock("~/manager/db", () => ({
  DBManager: dbMocks,
}))

const { DbConversionApplicationService } = await import("./service")

const postgresConfig = {
  dbConn: "192.168.1.9:5432/suhui_desktop",
  dbPassword: "secret",
  dbType: "postgres" as const,
  dbUser: "suhui_app",
  source: "store-override" as const,
}

const sqliteConfig = {
  dbConn: DEFAULT_SQLITE_PATH,
  dbPassword: "",
  dbType: "sqlite" as const,
  dbUser: "",
  source: "env" as const,
}

/** 每次 getEffectiveConfig 依次返回给定配置，模拟切库前后的读取。 */
const stageConfigs = (...configs: unknown[]) => {
  dbMocks.getEffectiveConfig.mockReset()
  for (const config of configs) dbMocks.getEffectiveConfig.mockReturnValueOnce(config)
  dbMocks.getEffectiveConfig.mockReturnValue(configs.at(-1))
}

describe("DbConversionApplicationService", () => {
  const release = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    backupMocks.exportToFile.mockResolvedValue({ footer: { recordCount: 1234 } })
    backupMocks.prepareReplace.mockResolvedValue({ token: "token-1" })
    backupMocks.restoreFromFile.mockResolvedValue({})
    dbMocks.beginMaintenance.mockResolvedValue(release)
    dbMocks.switchDatabase.mockImplementation(async () => {})
    dbMocks.getDefaultSqlitePath.mockReturnValue(DEFAULT_SQLITE_PATH)
  })

  it("postgres → sqlite：导出、切库、replace 恢复，并回报源库位置", async () => {
    stageConfigs(postgresConfig, sqliteConfig)

    const result = await new DbConversionApplicationService().convert({ to: "sqlite" })

    expect(result).toEqual({
      from: "postgres",
      to: "sqlite",
      sourceDbConn: postgresConfig.dbConn,
      targetDbConn: sqliteConfig.dbConn,
      recordCount: 1234,
    })
    expect(dbMocks.switchDatabase).toHaveBeenCalledExactlyOnceWith({
      dbType: "sqlite",
      dbConn: DEFAULT_SQLITE_PATH,
      dbUser: "",
      dbPassword: "",
    })
    expect(backupMocks.restoreFromFile).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "replace", confirmationToken: "token-1" }),
    )
  })

  it("sqlite → postgres：把目标连接参数透传给 switchDatabase", async () => {
    stageConfigs(sqliteConfig, postgresConfig)

    await new DbConversionApplicationService().convert({
      to: "postgres",
      targetDbConn: "10.0.0.2:5432/suhui",
      targetDbUser: "app",
      targetDbPassword: "pw",
    })

    expect(dbMocks.switchDatabase).toHaveBeenCalledExactlyOnceWith({
      dbType: "postgres",
      dbConn: "10.0.0.2:5432/suhui",
      dbUser: "app",
      dbPassword: "pw",
    })
  })

  it("转到 postgres 但没给连接串时直接拒绝，不导出也不切库", async () => {
    stageConfigs(sqliteConfig)

    await expect(new DbConversionApplicationService().convert({ to: "postgres" })).rejects.toThrow(
      /requires a target connection/,
    )
    expect(backupMocks.exportToFile).not.toHaveBeenCalled()
    expect(dbMocks.switchDatabase).not.toHaveBeenCalled()
  })

  it("切库没真正生效时立即失败，不对目标库做 replace", async () => {
    // 空 dbConn 会让 normalizeDbConfigOverride 返回 null，进而按 env 解析回 postgres
    stageConfigs(postgresConfig, postgresConfig)

    await expect(new DbConversionApplicationService().convert({ to: "sqlite" })).rejects.toThrow(
      /did not take effect/,
    )
    expect(backupMocks.prepareReplace).not.toHaveBeenCalled()
    expect(backupMocks.restoreFromFile).not.toHaveBeenCalled()
  })

  it("方言相同时直接拒绝，不导出也不切库", async () => {
    stageConfigs(sqliteConfig)

    await expect(new DbConversionApplicationService().convert({ to: "sqlite" })).rejects.toThrow(
      /already using sqlite/,
    )
    expect(backupMocks.exportToFile).not.toHaveBeenCalled()
    expect(dbMocks.switchDatabase).not.toHaveBeenCalled()
  })

  it("导出失败时不切库，源库分毫未动", async () => {
    stageConfigs(postgresConfig)
    backupMocks.exportToFile.mockRejectedValue(new Error("export boom"))

    await expect(new DbConversionApplicationService().convert({ to: "sqlite" })).rejects.toThrow(
      "export boom",
    )
    expect(dbMocks.switchDatabase).not.toHaveBeenCalled()
  })

  it("恢复失败时切回源方言并带上原凭据，然后抛出原始错误", async () => {
    stageConfigs(postgresConfig, sqliteConfig)
    backupMocks.restoreFromFile.mockRejectedValue(new Error("restore boom"))

    await expect(new DbConversionApplicationService().convert({ to: "sqlite" })).rejects.toThrow(
      "restore boom",
    )

    expect(dbMocks.switchDatabase).toHaveBeenCalledTimes(2)
    expect(dbMocks.switchDatabase).toHaveBeenLastCalledWith({
      dbType: "postgres",
      dbConn: postgresConfig.dbConn,
      dbUser: postgresConfig.dbUser,
      dbPassword: postgresConfig.dbPassword,
    })
    // 维护锁必须释放，否则整个应用会卡在维护态
    expect(release).toHaveBeenCalledOnce()
  })

  it("恢复期间持有维护锁，结束后释放", async () => {
    stageConfigs(postgresConfig, sqliteConfig)
    const order: string[] = []
    dbMocks.beginMaintenance.mockImplementation(async () => {
      order.push("acquire")
      return async () => {
        order.push("release")
      }
    })
    backupMocks.restoreFromFile.mockImplementation(async () => {
      order.push("restore")
      return {}
    })

    await new DbConversionApplicationService().convert({ to: "sqlite" })

    expect(order).toEqual(["acquire", "restore", "release"])
  })
})
