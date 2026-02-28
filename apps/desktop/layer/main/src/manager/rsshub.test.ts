import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"

import { join } from "pathe"
import { describe, expect, it, vi } from "vitest"

import type { RsshubProcessLike } from "./rsshub"
import {
  createRsshubRuntimeRoot,
  createRsshubEntryPath,
  createRsshubLaunchSpec,
  createRsshubManager,
  pollHealthCheck,
  resolveBundledChromeConfig,
  resolveRsshubRuntimeContext,
} from "./rsshub"

const createMockProcess = (): RsshubProcessLike => {
  let exitHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null

  return {
    kill: vi.fn(),
    on: vi.fn((event, handler) => {
      if (event === "exit") {
        exitHandler = handler as (code: number | null, signal: NodeJS.Signals | null) => void
      }
      return
    }),
    emitExit: (code = 1, signal: NodeJS.Signals | null = null) => {
      exitHandler?.(code, signal)
    },
  }
}

describe("RsshubManager", () => {
  it("health check 轮询应在后续成功时返回 true", async () => {
    let attempts = 0
    const ok = await pollHealthCheck({
      attempts: 5,
      intervalMs: 1,
      check: async () => {
        attempts += 1
        return attempts >= 3
      },
    })
    expect(ok).toBe(true)
    expect(attempts).toBe(3)
  })

  it("health check 轮询应在超限后返回 false", async () => {
    let attempts = 0
    const ok = await pollHealthCheck({
      attempts: 4,
      intervalMs: 1,
      check: async () => {
        attempts += 1
        return false
      },
    })
    expect(ok).toBe(false)
    expect(attempts).toBe(4)
  })

  it("仓库中应存在内置 RSSHub 入口脚本", () => {
    const entryPath = join(process.cwd(), "../../resources/rsshub/index.js")
    expect(existsSync(entryPath)).toBe(true)
  })

  it("spawn 模式应使用 Electron 内置 Node 启动并注入 ELECTRON_RUN_AS_NODE", () => {
    const spec = createRsshubLaunchSpec({
      mode: "spawn-node",
      entryPath: "/tmp/rsshub/index.js",
      port: 5123,
      token: "token-spawn",
      baseEnv: { NODE_ENV: "production" },
      execPath: "/Applications/FreeFolo.app/Contents/MacOS/FreeFolo",
    })

    expect(spec).toEqual({
      kind: "spawn",
      command: "/Applications/FreeFolo.app/Contents/MacOS/FreeFolo",
      args: ["/tmp/rsshub/index.js"],
      options: {
        env: {
          NODE_ENV: "production",
          PORT: "5123",
          RSSHUB_TOKEN: "token-spawn",
          ELECTRON_RUN_AS_NODE: "1",
        },
        stdio: "pipe",
      },
    })
  })

  it("fork 模式不应注入 ELECTRON_RUN_AS_NODE", () => {
    const spec = createRsshubLaunchSpec({
      mode: "fork",
      entryPath: "/tmp/rsshub/index.js",
      port: 5124,
      token: "token-fork",
      baseEnv: { NODE_ENV: "production" },
      execPath: "/Applications/FreeFolo.app/Contents/MacOS/FreeFolo",
    })

    expect(spec).toEqual({
      kind: "fork",
      modulePath: "/tmp/rsshub/index.js",
      options: {
        env: {
          NODE_ENV: "production",
          PORT: "5124",
          RSSHUB_TOKEN: "token-fork",
        },
        stdio: "pipe",
      },
    })
  })

  it("official 模式应注入 Twitter 本地凭据", () => {
    const spec = createRsshubLaunchSpec({
      mode: "spawn-node",
      runtimeMode: "official",
      entryPath: "/tmp/rsshub/official-entry.js",
      port: 5125,
      token: "token-official",
      baseEnv: { NODE_ENV: "production" },
      execPath: "/Applications/FreeFolo.app/Contents/MacOS/FreeFolo",
      rsshubEnv: {
        TWITTER_COOKIE: "auth_token=xxx; ct0=yyy",
      },
    } as any)

    expect(spec.kind).toBe("spawn")
    expect(spec.options.env.TWITTER_COOKIE).toBe("auth_token=xxx; ct0=yyy")
  })

  it("应根据打包环境生成 RSSHub 入口路径", () => {
    expect(
      createRsshubEntryPath({
        isPackaged: true,
        appPath: "/app/path",
        resourcesPath: "/resources/path",
      }),
    ).toBe("/resources/path/rsshub/index.js")

    expect(
      createRsshubEntryPath({
        isPackaged: false,
        appPath: "/app/path",
        resourcesPath: "/resources/path",
      }),
    ).toBe("/app/path/resources/rsshub/index.js")
  })

  it("应根据打包环境生成 RSSHub 运行根目录", () => {
    expect(
      createRsshubRuntimeRoot({
        isPackaged: true,
        appPath: "/app/path",
        resourcesPath: "/resources/path",
      }),
    ).toBe("/resources/path/rsshub")

    expect(
      createRsshubRuntimeRoot({
        isPackaged: false,
        appPath: "/app/path",
        resourcesPath: "/resources/path",
      }),
    ).toBe("/app/path/resources/rsshub")
  })

  it("应优先使用环境变量指定的 Chrome 路径", () => {
    const chromePath = join(process.cwd(), "../../resources/rsshub/index.js")
    const config = resolveBundledChromeConfig({
      runtimeRoot: "/tmp/not-used",
      env: {
        FREEFOLO_RSSHUB_CHROME_PATH: chromePath,
      },
    })
    expect(config.executablePath).toBe(chromePath)
  })

  it("应从 chrome-manifest 解析可执行路径与缓存目录", () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "rsshub-test-runtime-"))
    try {
      const binDir = join(runtimeRoot, "chrome/mac-136/chrome-mac/Chromium.app/Contents/MacOS")
      const executablePath = join(binDir, "Chromium")
      const cacheDir = join(runtimeRoot, "chrome")

      mkdirSync(binDir, { recursive: true })
      writeFileSync(executablePath, "")
      writeFileSync(
        join(runtimeRoot, "chrome-manifest.json"),
        JSON.stringify({
          version: 1,
          buildId: "136.0.7103.49",
          cacheDirRelative: "chrome",
          executablePathRelative: "chrome/mac-136/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        }),
      )

      const config = resolveBundledChromeConfig({
        runtimeRoot,
        env: {},
      })
      expect(config.executablePath).toBe(executablePath)
      expect(config.cacheDir).toBe(cacheDir)
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true })
    }
  })

  it("应优先使用 electron app 上下文判定运行时路径", () => {
    const packaged = resolveRsshubRuntimeContext({
      env: {},
      cwd: "/dev-cwd",
      resourcesPath: "/Resources",
      electronApp: {
        isPackaged: true,
        getAppPath: () => "/AppBundle/Contents/Resources/app.asar",
      },
    })
    expect(packaged).toEqual({
      isPackaged: true,
      appPath: "/AppBundle/Contents/Resources/app.asar",
      resourcesPath: "/Resources",
    })

    const dev = resolveRsshubRuntimeContext({
      env: {},
      cwd: "/workspace/apps/desktop",
      resourcesPath: "/Resources",
      electronApp: {
        isPackaged: false,
        getAppPath: () => "/workspace/apps/desktop",
      },
    })
    expect(dev).toEqual({
      isPackaged: false,
      appPath: "/workspace/apps/desktop",
      resourcesPath: "/Resources",
    })
  })

  it("启动成功后应进入 running 状态并返回端口", async () => {
    const process = createMockProcess()
    const manager = createRsshubManager({
      createPort: async () => 18080,
      createToken: () => "token-1",
      launch: async () => process,
      healthCheck: async () => true,
      maxRetries: 3,
      retryDelaysMs: [1, 2, 3],
    })

    const result = await manager.start()

    expect(result.port).toBe(18080)
    expect(result.token).toBe("token-1")
    expect(manager.getState().status).toBe("running")
    expect(manager.getState().port).toBe(18080)
  })

  it("已运行时 ensureRunning 应直接返回端口且不重复启动", async () => {
    const process = createMockProcess()
    const launch = vi.fn(async () => process)

    const manager = createRsshubManager({
      createPort: async () => 18081,
      createToken: () => "token-2",
      launch,
      healthCheck: async () => true,
      maxRetries: 3,
      retryDelaysMs: [1, 2, 3],
    })

    await manager.start()
    const port = await manager.ensureRunning()

    expect(port).toBe(18081)
    expect(launch).toHaveBeenCalledTimes(1)
  })

  it("超过最大重试后应进入 cooldown", async () => {
    vi.useFakeTimers()

    const process = createMockProcess()
    const manager = createRsshubManager({
      createPort: async () => 18082,
      createToken: () => "token-3",
      launch: async () => process,
      healthCheck: async () => false,
      maxRetries: 1,
      retryDelaysMs: [100],
      cooldownMs: 5000,
    })

    await expect(manager.start()).rejects.toThrow("RSSHub health check failed")

    expect(manager.getState().status).toBe("error")

    await vi.advanceTimersByTimeAsync(100)

    expect(manager.getState().status).toBe("cooldown")
    expect(manager.getState().cooldownUntil).not.toBeNull()

    vi.useRealTimers()
  })

  it("stop 应终止子进程并重置状态", async () => {
    const process = createMockProcess()
    const manager = createRsshubManager({
      createPort: async () => 18083,
      createToken: () => "token-4",
      launch: async () => process,
      healthCheck: async () => true,
      maxRetries: 3,
      retryDelaysMs: [1, 2, 3],
    })

    await manager.start()
    await manager.stop()

    expect(process.kill).toHaveBeenCalledWith("SIGTERM")
    expect(manager.getState().status).toBe("stopped")
    expect(manager.getState().port).toBeNull()
    expect(manager.getState().token).toBeNull()
  })

  it("cooldown 到期后应自动触发一次重试", async () => {
    vi.useFakeTimers()

    const process = createMockProcess()
    let healthCallCount = 0
    const manager = createRsshubManager({
      createPort: async () => 18084,
      createToken: () => "token-5",
      launch: async () => process,
      healthCheck: async () => {
        healthCallCount += 1
        if (healthCallCount <= 2) return false
        return true
      },
      maxRetries: 1,
      retryDelaysMs: [100],
      cooldownMs: 500,
    })

    await expect(manager.start()).rejects.toThrow("RSSHub health check failed")
    await vi.advanceTimersByTimeAsync(100)

    expect(manager.getState().status).toBe("cooldown")

    await vi.advanceTimersByTimeAsync(500)

    expect(manager.getState().status).toBe("running")
    expect(manager.getState().port).toBe(18084)

    vi.useRealTimers()
  })
})
