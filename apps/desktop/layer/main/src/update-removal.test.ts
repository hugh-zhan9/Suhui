import { describe, expect, it, vi } from "vitest"

describe("remove app update entrypoints", () => {
  it("does not initialize updater registration", async () => {
    vi.resetModules()

    const setFeedURL = vi.fn()
    const on = vi.fn()

    vi.doMock("electron-log", () => ({
      default: {
        initialize: vi.fn(),
        scope: vi.fn(() => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        })),
      },
    }))
    vi.doMock("electron-updater", () => ({
      autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        autoRunAppAfterInstall: false,
        allowPrerelease: false,
        forceDevUpdateConfig: false,
        setFeedURL,
        on,
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        quitAndInstall: vi.fn(),
      },
      NsisUpdater: vi.fn(),
    }))
    vi.doMock("electron", () => ({
      app: {
        getPath: vi.fn(() => "/tmp"),
        on: vi.fn(),
      },
    }))
    vi.doMock("@suhui/shared/constants", () => ({
      DEV: false,
      MICROSOFT_STORE_BUILD: false,
      MODE: "production",
      ModeEnum: {
        production: "production",
        development: "development",
        staging: "staging",
      },
    }))
    vi.doMock("~/manager/window", () => ({ WindowManager: { getMainWindow: vi.fn() } }))
    vi.doMock("~/updater/hot-updater", () => ({
      RendererEligibilityStatus: {
        NoManifest: 0,
        AlreadyCurrent: 1,
        RequiresFullAppUpdate: 2,
        Eligible: 3,
      },
      rendererUpdater: {
        extractManifest: vi.fn(),
        extractManifestFromRendererUpdate: vi.fn(),
        evaluateManifest: vi.fn(() => ({ status: 1 })),
        applyManifest: vi.fn(),
      },
    }))
    vi.doMock("../env", () => ({ channel: "stable", isWindows: false }))
    vi.doMock("./api", () => ({
      getDistributionUpdateInfo: vi.fn(),
      getUpdateInfo: vi.fn(),
    }))
    vi.doMock("./configs", () => ({
      appUpdaterConfig: {
        enableAppUpdate: false,
        enableDistributionStoreUpdate: false,
        enableCoreUpdate: false,
        enableRenderHotUpdate: false,
        app: {
          autoCheckUpdate: false,
          autoDownloadUpdate: false,
          checkUpdateInterval: 0,
        },
      },
    }))
    vi.doMock("./follow-update-provider", () => ({ FollowUpdateProvider: class {} }))
    vi.doMock("./windows-updater", () => ({ WindowsUpdater: vi.fn() }))
    vi.doMock("@pkg", () => ({ mainHash: "hash", version: "1.0.0" }))
    vi.doMock("@suhui/shared/bridge", () => ({ callWindowExpose: vi.fn() }))

    const { registerUpdater } = await import("./updater")
    registerUpdater()

    expect(setFeedURL).not.toHaveBeenCalled()
    expect(on).not.toHaveBeenCalled()
  })

  it("does not include check for updates in application menu", async () => {
    vi.resetModules()

    const buildFromTemplate = vi.fn(() => ({}))
    const setApplicationMenu = vi.fn()

    vi.doMock("electron", () => ({
      Menu: {
        buildFromTemplate,
        setApplicationMenu,
      },
    }))
    vi.doMock("./env", () => ({ isMacOS: false, isMAS: false }))
    vi.doMock("./lib/cleaner", () => ({ clearAllDataAndConfirm: vi.fn() }))
    vi.doMock("./lib/i18n", () => ({ t: (key: string) => key }))
    vi.doMock("./logger", () => ({ revealLogFile: vi.fn() }))
    vi.doMock("./manager/window", () => ({ WindowManager: { getMainWindow: vi.fn() } }))
    vi.doMock("./updater", () => ({
      checkForAppUpdates: vi.fn(),
      quitAndInstall: vi.fn(),
    }))
    vi.doMock("@suhui/shared/bridge", () => ({ callWindowExpose: vi.fn() }))
    vi.doMock("@suhui/shared/constants", () => ({ DEV: false }))
    vi.doMock("@suhui/shared/event", () => ({ dispatchEventOnWindow: vi.fn() }))
    vi.doMock("@pkg", () => ({ name: "溯洄" }))

    const { registerAppMenu } = await import("./menu")
    registerAppMenu()

    const template = buildFromTemplate.mock.calls[0]?.[0] as Array<any>
    const helpMenu = template.find((item) => item.role === "help")
    const serialized = JSON.stringify(helpMenu)

    expect(serialized).not.toContain("menu.checkForUpdates")
    expect(setApplicationMenu).toHaveBeenCalled()
  })

  it("does not include check for updates in tray menu", async () => {
    vi.resetModules()

    const buildFromTemplate = vi.fn(() => ({ items: [] }))
    const setContextMenu = vi.fn()
    const setToolTip = vi.fn()
    const on = vi.fn()

    vi.doMock("electron", () => ({
      app: { getName: vi.fn(() => "溯洄"), quit: vi.fn() },
      Menu: { buildFromTemplate },
      nativeImage: {
        createFromPath: vi.fn(() => ({
          resize: vi.fn(() => ({ setTemplateImage: vi.fn() })),
          setTemplateImage: vi.fn(),
        })),
      },
      Tray: vi.fn(() => ({
        setContextMenu,
        setToolTip,
        on,
        destroy: vi.fn(),
      })),
    }))
    vi.doMock("~/env", () => ({ isMacOS: false, isMAS: false, isWindows: false }))
    vi.doMock("~/helper", () => ({ getTrayIconPath: vi.fn(() => "tray.png") }))
    vi.doMock("~/logger", () => ({ logger: { info: vi.fn() }, revealLogFile: vi.fn() }))
    vi.doMock("~/manager/window", () => ({
      WindowManager: {
        getMainWindowOrCreate: vi.fn(() => ({
          isMinimized: vi.fn(() => false),
          show: vi.fn(),
          webContents: { reload: vi.fn(), toggleDevTools: vi.fn() },
        })),
      },
    }))
    vi.doMock("~/updater", () => ({ checkForAppUpdates: vi.fn() }))
    vi.doMock("./lib/dock", () => ({ getDockCount: vi.fn(() => 0) }))
    vi.doMock("./i18n", () => ({ t: (key: string) => key }))
    vi.doMock("./store", () => ({ store: { get: vi.fn(() => true), set: vi.fn() } }))
    vi.doMock("~/lib/store", () => ({ store: { get: vi.fn(() => true), set: vi.fn() } }))
    vi.doMock("@pkg", () => ({ name: "溯洄" }))

    const { registerAppTray } = await import("./lib/tray")
    registerAppTray()

    const template = buildFromTemplate.mock.calls[0]?.[0] as Array<any>
    const helpMenu = template.find((item) => item.label === "menu.help")
    const serialized = JSON.stringify(helpMenu)

    expect(serialized).not.toContain("menu.checkForUpdates")
    expect(setContextMenu).toHaveBeenCalled()
  })
})
