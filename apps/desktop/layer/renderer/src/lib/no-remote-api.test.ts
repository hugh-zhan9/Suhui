import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import path from "pathe"
import { describe, expect, it } from "vitest"

/**
 * 远端后端已经不存在（`api()` 指向 https://api.suhui.io，没有服务在跑），
 * store 模块里的远端调用已全部清零。这条约束从此是零容忍：任何新增的
 * `api()` 调用都会让测试失败，没有待办清单可以躲。
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))

const STORE_MODULES_DIR = path.resolve(
  HERE,
  "../../../../../../packages/internal/store/src/modules",
)
const RENDERER_SRC_DIR = path.resolve(HERE, "..")

/** 只有这个文件可以持有客户端实例本身（登录会话仍需要它的类型与拦截器）。 */
const API_CLIENT_FILE = "lib/api-client.ts"
/** 只有 toast 包装层可以直接从 sonner 取 toast。 */
const TOAST_WRAPPER_FILE = "lib/toast.ts"

const REMOTE_CALL = /\bapi\(\)\./
/** 渲染层的另一条出口：直接拿 SDK 客户端打远端。 */
const SDK_CALL = /\bfollowClient\.api\b/
/** 绕过包装层直接用 sonner 的 toast，会丢掉错误 toast 的复制按钮。 */
const RAW_TOAST_IMPORT = /import \{ toast \} from "sonner"/

const walk = (dir: string, prefix = "", extensions = [".ts"]): string[] => {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const child = path.join(dir, name)
    if (statSync(child).isDirectory()) {
      out.push(...walk(child, `${prefix}${name}/`, extensions))
      continue
    }
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue
    if (extensions.some((extension) => name.endsWith(extension))) out.push(`${prefix}${name}`)
  }
  return out
}

const read = (relative: string) => readFileSync(path.join(STORE_MODULES_DIR, relative), "utf8")
const readRenderer = (relative: string) =>
  readFileSync(path.join(RENDERER_SRC_DIR, relative), "utf8")

describe("store 模块不得调用远端 API", () => {
  const files = walk(STORE_MODULES_DIR)

  it("能扫到 store 模块源文件", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it("任何 store 模块都不得包含 api() 调用", () => {
    const offenders = files.filter((file) => REMOTE_CALL.test(read(file)))

    expect(offenders).toEqual([])
  })

  it("渲染层除 api-client 本身外不得直接调用 followClient.api", () => {
    const rendererFiles = walk(RENDERER_SRC_DIR, "", [".ts", ".tsx"])
    expect(rendererFiles.length).toBeGreaterThan(100)

    const offenders = rendererFiles.filter(
      (file) => file !== API_CLIENT_FILE && SDK_CALL.test(readRenderer(file)),
    )

    expect(offenders).toEqual([])
  })

  it("渲染层只能通过 ~/lib/toast 使用 toast（否则错误 toast 丢掉复制按钮）", () => {
    const rendererFiles = walk(RENDERER_SRC_DIR, "", [".ts", ".tsx"])

    const offenders = rendererFiles.filter(
      (file) => file !== TOAST_WRAPPER_FILE && RAW_TOAST_IMPORT.test(readRenderer(file)),
    )

    expect(offenders).toEqual([])
  })
})
