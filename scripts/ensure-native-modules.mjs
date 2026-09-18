// 确认原生模块在 Electron 运行时里真的能用，不能用就按 Electron 的 ABI 重编。
//
// better-sqlite3 从 13.0.0 起改用 N-API 并随包发布各平台 prebuild，同一份
// 二进制在系统 Node 与 Electron 下通用，正常情况下这里只是探测通过、不重编。
// 保留重编分支是因为：12.x 那种 ABI 锁定的二进制一旦回归（换依赖、锁文件
// 回滚、或新增别的原生模块），运行时才会以 ERR_DLOPEN_FAILED 暴露，代价太大。
//
// 单元测试不使用 better-sqlite3——SQLite 相关测试走 Node 内置的
// node:sqlite 配 drizzle 的 sqlite-proxy，两者共用同一套 drizzle sqlite 方言，
// 生成的 SQL 完全一致，且不需要任何原生模块。
//
// 探测必须真的建一次库：better-sqlite3 的 `require()` 只加载 JS 包装层，
// 到 `new Database()` 才 dlopen 那个 .node，所以只 require 会在 ABI 不匹配时
// 假阳性通过——Electron 38 升 43 时就是这样漏过去的。
//
// 重编走 `@electron/rebuild` 的编程 API 而不是 `electron-rebuild` CLI：
// 该 CLI 依赖 yargs@17，后者声明了 `type: module` 却让 `require` 条件指向
// 一个写着 CJS 的无扩展名文件，Node 26 起会按 ESM 解析并抛
// `require is not defined in ES module scope`。编程入口不碰 yargs。
//
// `.npmrc` 是 `node-linker=hoisted`，原生模块实际躺在仓库根的 node_modules，
// 所以重编的 buildPath 取仓库根；声明该依赖的 workspace 只用来解析版本。
import { execFileSync } from "node:child_process"
import { rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** 声明这些依赖的 workspace 包目录 */
const WORKSPACE_DIR = "apps/desktop"
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** 每个原生模块配一段在 Electron 里真正触发 dlopen 的代码 */
const NATIVE_MODULES = {
  "better-sqlite3": `
    const Database = require("better-sqlite3")
    const db = new Database(":memory:")
    db.prepare("select 1 as ok").get()
    db.close()
  `,
}

const requireFromWorkspace = createRequire(resolve(WORKSPACE_DIR, "package.json"))

/** Electron 的确切版本以装出来的那份为准，不读 package.json 里的区间 */
const getElectronVersion = () => requireFromWorkspace("electron/package.json").version

/** 在 Electron 运行时里真正用一次，这是唯一有意义的验证 */
const worksInElectron = (moduleName) => {
  // 探测文件必须落在仓库内，否则 require 解析不到 workspace 的 node_modules
  const probe = join(WORKSPACE_DIR, ".native-abi-probe.cjs")
  writeFileSync(probe, `${NATIVE_MODULES[moduleName]}\nconsole.log("ok")\n`)
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
for (const moduleName of Object.keys(NATIVE_MODULES)) {
  if (worksInElectron(moduleName)) continue

  console.info(
    `[ensure-native-modules] ${moduleName} 在 Electron 下无法使用，按 Electron ABI 重编…`,
  )
  const { rebuild } = requireFromWorkspace("@electron/rebuild")
  await rebuild({
    buildPath: REPO_ROOT,
    projectRootPath: REPO_ROOT,
    electronVersion: getElectronVersion(),
    arch: process.arch,
    // 依赖遍历从仓库根出发，走不到 workspace 包声明的依赖，
    // 所以直接点名该模块，并放开 dev 类型。
    onlyModules: [moduleName],
    extraModules: [moduleName],
    types: ["prod", "dev", "optional"],
    force: true,
  })

  if (!worksInElectron(moduleName)) {
    throw new Error(`[ensure-native-modules] ${moduleName} 重编后在 Electron 下仍无法使用`)
  }
  rebuilt += 1
}

console.info(
  rebuilt === 0
    ? "[ensure-native-modules] 原生模块的 Electron ABI 均正常"
    : `[ensure-native-modules] 已按 Electron ABI 重编 ${rebuilt} 个原生模块`,
)
