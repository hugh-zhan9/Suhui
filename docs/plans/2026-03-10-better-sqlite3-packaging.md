# better-sqlite3 Packaging Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 确保打包产物包含 `better_sqlite3.node`，修复 macOS 白屏问题。

**Architecture:** 仅调整 Electron Forge 打包阶段的文件复制逻辑，确保 `better_sqlite3.node` 在 asar 打包阶段可见并被解包进 `app.asar.unpacked`。

**Tech Stack:** Electron Forge, electron-vite, Node.js (fs/cp), TypeScript

---

### Task 1: 为打包产物添加最小化可回归测试

**Files:**

- Create: `apps/desktop/scripts/packaging/better-sqlite3-package.test.ts`
- Modify: `apps/desktop/package.json`（新增测试脚本）

**Step 1: Write the failing test**

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import { execFileSync } from "node:child_process"
import path from "node:path"

const findZip = () => {
  const output = execFileSync("/bin/ls", ["-1", "/tmp/folo-forge-out/make/zip/darwin/arm64"], {
    encoding: "utf-8",
  })
  const zip = output.split("\n").find((name) => name.endsWith(".zip"))
  if (!zip) throw new Error("zip not found")
  return path.join("/tmp/folo-forge-out/make/zip/darwin/arm64", zip)
}

test("packaged zip should include better_sqlite3.node", () => {
  const zipPath = findZip()
  const list = execFileSync("/usr/bin/unzip", ["-l", zipPath], { encoding: "utf-8" })
  assert.ok(
    list.includes(
      "app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ),
  )
})
```

**Step 2: Run test to verify it fails**

Run: `node --test apps/desktop/scripts/packaging/better-sqlite3-package.test.ts`

Expected: FAIL (zip 内不包含 `better_sqlite3.node`)

**Step 3: Write minimal implementation**

无需实现逻辑，先让测试文件进入 repo，保证在修复前失败。

**Step 4: Re-run test to confirm failure**

Run: `node --test apps/desktop/scripts/packaging/better-sqlite3-package.test.ts`

Expected: FAIL

**Step 5: Commit**

```bash
git add apps/desktop/scripts/packaging/better-sqlite3-package.test.ts apps/desktop/package.json

git commit -m "test: add packaging check for better-sqlite3 node"
```

---

### Task 2: 在打包阶段复制 better_sqlite3.node

**Files:**

- Modify: `apps/desktop/forge.config.cts`

**Step 1: Write the failing test**

Use the same test from Task 1.

**Step 2: Run test to verify it fails**

Run: `node --test apps/desktop/scripts/packaging/better-sqlite3-package.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

在 `cleanSources` 之后追加复制步骤：

```ts
const ensureBetterSqliteBinary = async (buildPath: string) => {
  if (process.platform !== "darwin") return
  const sourceBinary = getBetterSqliteBinaryPath()
  const targetBinary = path.join(
    buildPath,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  )

  await fs.promises.mkdir(path.dirname(targetBinary), { recursive: true })
  await fs.promises.copyFile(sourceBinary, targetBinary)
}
```

然后在 `afterCopy` 阶段调用：

```ts
afterCopy: [
  async (...args) => {
    await cleanSources(...args)
    await ensureBetterSqliteBinary(args[0])
  },
  process.platform !== "win32" ? noopAfterCopy : setLanguages([...keepLanguages.values()]),
],
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter suhui build:electron:unsigned`

Then:
`node --test apps/desktop/scripts/packaging/better-sqlite3-package.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/forge.config.cts

git commit -m "fix: include better-sqlite3 native binding in package"
```

---

### Task 3: 交付与验证

**Files:**

- N/A

**Step 1: Rebuild package**

Run: `pnpm --filter suhui build:electron:unsigned`

**Step 2: Install to /Applications**

解压 zip 并替换 `/Applications/溯洄.app`（不备份）

**Step 3: Smoke test**

启动应用，确认不白屏。
