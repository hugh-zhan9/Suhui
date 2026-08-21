// 确保原生模块按 Electron 的 ABI 编译。
//
// better-sqlite3 的二进制是 ABI 锁定的，不是 ABI 稳定的 N-API 插件：
// 用系统 Node 编出来的是 NODE_MODULE_VERSION 141，而 Electron 38 需要 139，
// 加载会 ERR_DLOPEN_FAILED。app 的开发与打包都跑在 Electron 里，所以
// node_modules 里必须留 Electron 版。
//
// 单元测试因此不使用 better-sqlite3——SQLite 相关测试走 Node 内置的
// node:sqlite 配 drizzle 的 sqlite-proxy，两者共用同一套 drizzle sqlite 方言，
// 生成的 SQL 完全一致，且不需要任何原生模块。
//
// 注意：pnpm 与 electron-rebuild 都必须在声明该依赖的 workspace 包目录下执行，
// 在仓库根执行会找不到它。
import { execFileSync } from "node:child_process"
import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** 声明这些依赖的 workspace 包目录 */
const WORKSPACE_DIR = "apps/desktop"
const NATIVE_MODULES = ["better-sqlite3"]

/** 在 Electron 运行时里试加载，这是唯一有意义的验证 */
const loadsInElectron = (moduleName) => {
  // 探测文件必须落在仓库内，否则 require 解析不到 workspace 的 node_modules
  const probe = join(WORKSPACE_DIR, ".native-abi-probe.cjs")
  writeFileSync(probe, `require(${JSON.stringify(moduleName)}); console.log("ok")`)
  try {
    const out = execFileSync("pnpm", ["exec", "electron", ".native-abi-probe.cjs"], {
      cwd: WORKSPACE_DIR,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return out.includes("ok")
  } catch {
    return false
  } finally {
    rmSync(probe, { force: true })
  }
}

let rebuilt = 0
for (const moduleName of NATIVE_MODULES) {
  if (loadsInElectron(moduleName)) continue

  console.info(
    `[ensure-native-modules] ${moduleName} 在 Electron 下无法加载，按 Electron ABI 重编…`,
  )
  execFileSync("pnpm", ["exec", "electron-rebuild", "-f", "-o", moduleName], {
    cwd: WORKSPACE_DIR,
    stdio: "inherit",
  })

  if (!loadsInElectron(moduleName)) {
    throw new Error(`[ensure-native-modules] ${moduleName} 重编后在 Electron 下仍无法加载`)
  }
  rebuilt += 1
}

console.info(
  rebuilt === 0
    ? "[ensure-native-modules] 原生模块的 Electron ABI 均正常"
    : `[ensure-native-modules] 已按 Electron ABI 重编 ${rebuilt} 个原生模块`,
)
