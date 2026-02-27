import { fork, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import * as http from "node:http"
import * as net from "node:net"

import { join } from "pathe"

export type RsshubStatus = "stopped" | "starting" | "running" | "error" | "cooldown"

export interface RsshubProcessLike {
  kill: (signal?: NodeJS.Signals | number) => void
  on: (
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ) => void
  emitExit?: (code?: number, signal?: NodeJS.Signals | null) => void
}

export interface RsshubManagerState {
  process: RsshubProcessLike | null
  port: number | null
  token: string | null
  status: RsshubStatus
  retryCount: number
  cooldownUntil: number | null
}

interface RsshubManagerDeps {
  createPort: () => Promise<number>
  createToken: () => string
  launch: (params: { port: number; token: string }) => Promise<RsshubProcessLike>
  healthCheck: (params: { port: number; token: string }) => Promise<boolean>
  maxRetries: number
  retryDelaysMs: number[]
  cooldownMs: number
  now: () => number
  schedule: (fn: () => void, delayMs: number) => void
}

type RsshubLaunchMode = "fork" | "spawn-node"

type RsshubLaunchSpec =
  | {
      kind: "fork"
      modulePath: string
      options: {
        env: NodeJS.ProcessEnv
        stdio: "pipe"
      }
    }
  | {
      kind: "spawn"
      command: string
      args: string[]
      options: {
        env: NodeJS.ProcessEnv
        stdio: "pipe"
      }
    }

export const createRsshubLaunchSpec = ({
  mode,
  entryPath,
  port,
  token,
  baseEnv,
  execPath,
}: {
  mode: RsshubLaunchMode
  entryPath: string
  port: number
  token: string
  baseEnv: NodeJS.ProcessEnv
  execPath: string
}): RsshubLaunchSpec => {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PORT: String(port),
    RSSHUB_TOKEN: token,
    NODE_ENV: baseEnv.NODE_ENV || "production",
  }

  if (mode === "spawn-node") {
    return {
      kind: "spawn",
      command: execPath,
      args: [entryPath],
      options: {
        env: {
          ...env,
          ELECTRON_RUN_AS_NODE: "1",
        },
        stdio: "pipe",
      },
    }
  }

  return {
    kind: "fork",
    modulePath: entryPath,
    options: {
      env,
      stdio: "pipe",
    },
  }
}

const findAvailablePort = async () => {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.on("error", (error) => {
      reject(error)
    })
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate port")))
        return
      }
      const { port } = address
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr)
          return
        }
        resolve(port)
      })
    })
  })
}

export const createRsshubEntryPath = ({
  isPackaged,
  appPath,
  resourcesPath,
}: {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
}) => {
  if (isPackaged) {
    return join(resourcesPath, "rsshub", "index.js")
  }
  return join(appPath, "resources", "rsshub", "index.js")
}

const defaultDeps = (): RsshubManagerDeps => ({
  createPort: findAvailablePort,
  createToken: () => randomBytes(32).toString("hex"),
  launch: async ({ port, token }) => {
    const entryPath = createRsshubEntryPath({
      isPackaged: !!process.env["ELECTRON_IS_PACKAGED"],
      appPath: process.cwd(),
      resourcesPath: process.resourcesPath || process.cwd(),
    })

    if (!existsSync(entryPath)) {
      throw new Error(`RSSHub runtime entry not found: ${entryPath}`)
    }

    const mode: RsshubLaunchMode =
      process.env["FREEFOLO_RSSHUB_LAUNCH_MODE"] === "fork" ? "fork" : "spawn-node"
    const spec = createRsshubLaunchSpec({
      mode,
      entryPath,
      port,
      token,
      baseEnv: process.env,
      execPath: process.execPath,
    })

    const child =
      spec.kind === "fork"
        ? fork(spec.modulePath, [], spec.options)
        : spawn(spec.command, spec.args, spec.options)

    return child as unknown as RsshubProcessLike
  },
  healthCheck: async ({ port, token }) => {
    return new Promise((resolve) => {
      const request = http.get(
        `http://127.0.0.1:${port}/healthz`,
        {
          headers: {
            "X-RSSHub-Token": token,
          },
        },
        (res) => {
          const ok = (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300
          res.resume()
          resolve(ok)
        },
      )

      request.setTimeout(10_000, () => {
        request.destroy(new Error("Health check timeout"))
        resolve(false)
      })
      request.on("error", () => resolve(false))
    })
  },
  maxRetries: 3,
  retryDelaysMs: [1000, 2000, 4000],
  cooldownMs: 5 * 60 * 1000,
  now: () => Date.now(),
  schedule: (fn, delayMs) => {
    setTimeout(fn, delayMs)
  },
})

class RsshubManager {
  private readonly deps: RsshubManagerDeps
  private state: RsshubManagerState = {
    process: null,
    port: null,
    token: null,
    status: "stopped",
    retryCount: 0,
    cooldownUntil: null,
  }

  private startPromise: Promise<{ port: number; token: string }> | null = null

  constructor(deps: RsshubManagerDeps) {
    this.deps = deps
  }

  getState() {
    return { ...this.state }
  }

  async ensureRunning(): Promise<number> {
    if (this.state.status === "running" && this.state.port) {
      return this.state.port
    }

    const result = await this.start()
    return result.port
  }

  async start(): Promise<{ port: number; token: string }> {
    if (this.startPromise) {
      return this.startPromise
    }

    if (this.state.status === "running" && this.state.port && this.state.token) {
      return { port: this.state.port, token: this.state.token }
    }

    const { cooldownUntil } = this.state
    if (this.state.status === "cooldown" && cooldownUntil && this.deps.now() < cooldownUntil) {
      throw new Error("RSSHub in cooldown")
    }

    this.state.status = "starting"
    this.startPromise = this.startInternal()

    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  private async startInternal(): Promise<{ port: number; token: string }> {
    const port = await this.deps.createPort()
    const token = this.deps.createToken()
    const processRef = await this.deps.launch({ port, token })

    processRef.on("exit", () => {
      this.handleChildExit()
    })

    this.state.process = processRef
    this.state.port = port
    this.state.token = token

    const healthy = await this.deps.healthCheck({ port, token })
    if (!healthy) {
      this.state.status = "error"
      this.scheduleRetry()
      throw new Error("RSSHub health check failed")
    }

    this.state.status = "running"
    this.state.retryCount = 0
    this.state.cooldownUntil = null

    return { port, token }
  }

  async stop(): Promise<void> {
    if (this.state.process) {
      this.state.process.kill("SIGTERM")
    }

    this.state = {
      process: null,
      port: null,
      token: null,
      status: "stopped",
      retryCount: 0,
      cooldownUntil: null,
    }
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  private handleChildExit() {
    if (this.state.status === "stopped") return

    this.state.status = "error"
    this.scheduleRetry()
  }

  private scheduleRetry() {
    if (this.state.retryCount >= this.deps.maxRetries) {
      this.state.status = "cooldown"
      this.state.cooldownUntil = this.deps.now() + this.deps.cooldownMs
      this.deps.schedule(() => {
        if (this.state.status !== "cooldown") return
        if (!this.state.cooldownUntil || this.deps.now() < this.state.cooldownUntil) return
        void this.start().catch(() => {
          // 失败由 start 内部状态机处理
        })
      }, this.deps.cooldownMs)
      return
    }

    const delay =
      this.deps.retryDelaysMs[this.state.retryCount] ?? this.deps.retryDelaysMs.at(-1) ?? 1000
    this.state.retryCount += 1

    this.deps.schedule(() => {
      void this.start().catch(() => {
        // 失败由 start 内部状态机处理
      })
    }, delay)
  }
}

export const createRsshubManager = (partialDeps: Partial<RsshubManagerDeps>) => {
  const deps = {
    ...defaultDeps(),
    ...partialDeps,
  }
  return new RsshubManager(deps)
}

export const rsshubManager = createRsshubManager({})
