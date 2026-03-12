# Suhui Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复当前 `@suhui/electron-main` 构建失败，并把内部 workspace 包名与桌面打包身份统一为 `@suhui/*` 与 `suhui` 品牌配置。

**Architecture:** 先以最小变更修复 `tsc` 构建错误，确保构建可通过；随后对内部 workspace 包名与引用做系统性替换；最后统一 Electron Forge 打包身份（appId/协议/产物输出与更新源），并重新跑构建与全量测试验证。

**Tech Stack:** TypeScript, Electron Forge, pnpm workspace, Vitest

---

### Task 1: 修复 `sqlite-postgres-migration` 构建错误

**Files:**

- Modify: `apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts`
- Test: `apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts`

**Step 1: Write the failing test**

- 当前已有测试，但 `tsc` 报 `Object is possibly 'undefined'`。
- 先明确类型断言方式，保证测试语义不变（例如将 `match` 做显式检查或用 `expect(match).not.toBeNull()` 后再读取）。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @suhui/electron-main build
```

Expected: FAIL with `TS2532: Object is possibly 'undefined'`.

**Step 3: Write minimal implementation**

- 调整测试代码访问 `match` 时的类型安全方式（如使用 `if (!match) throw` 或 `expect(match).not.toBeNull()` 并安全解构）。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @suhui/electron-main build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts
git commit -m "fix: satisfy tsc in sqlite-postgres-migration test"
```

---

### Task 2: 统一内部 workspace 包名到 `@suhui/*`

**Files:**

- Modify: `packages/*/package.json`
- Modify: `apps/desktop/layer/main/package.json`
- Modify: `apps/desktop/layer/renderer/package.json`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/tsconfig.json`
- Modify: `apps/desktop/layer/main/tsconfig.json`
- Modify: `apps/desktop/layer/renderer/tsconfig.json`
- Modify: 全仓库 `@suhui/*` import 与引用

**Step 1: Write the failing test**

- 在改动前，记录当前 `@suhui/*` workspace 包名列表，确认只替换内部包名与引用。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @suhui/electron-main build
```

Expected: 旧名称仍在（作为基线检查）。

**Step 3: Write minimal implementation**

- 将 workspace 包名统一替换为 `@suhui/*`（包名与依赖引用一致）。
- 更新 tsconfig paths 与其他 alias 引用。
- 保留外部依赖（`@follow-app/*` 等非 workspace）不变。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @suhui/electron-main build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages apps/desktop
git commit -m "refactor: rename workspace packages to @suhui scope"
```

---

### Task 3: 统一打包身份（appId/协议/输出目录/URL）

**Files:**

- Modify: `apps/desktop/forge.config.cts`
- Modify: `apps/desktop/scripts/generate-appx-manifest.ts`
- Modify: `apps/desktop/layer/main/src/manager/app.ts`
- Modify: `apps/desktop/layer/main/src/manager/window.ts` (if protocol constants rely on legacy names)
- Modify: `apps/desktop/layer/main/src/manager/bootstrap.ts` (if legacy protocol list exists)
- Modify: `apps/desktop/vite.config.ts` (debug/proxy URL)
- Modify: `apps/desktop/layer/main/src/updater/*` (更新源/资源 URL)
- Modify: any other URL references from `rg -n "follow|folo" apps/desktop`

**Step 1: Write the failing test**

- 更新或新增最小测试用例（如现有 branding/test 中的断言）以验证新 URL/协议（若已有测试覆盖）。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test
```

Expected: FAIL where旧值仍存在（若测试覆盖到）。

**Step 3: Write minimal implementation**

- `appBundleId/appId` -> `io.suhui`
- 协议 scheme -> `suhui`（移除 follow/folo）
- 输出目录 -> `/tmp/suhui-forge-out`
- 更新源/资源 URL -> `https://suhui.io`
- Windows AppX `packageName/identityName/protocols` 同步新品牌

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @suhui/electron-main build
pnpm test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop
git commit -m "refactor: align packaging identity to suihui"
```

---

### Task 4: 全量验证与变更记录

**Files:**

- Modify: `docs/AI_CHANGELOG.md` (via flight-recorder)

**Step 1: Run verification**

```bash
pnpm --filter @suhui/electron-main build
pnpm test
```

Expected: PASS.

**Step 2: Flight recorder**

Run:

```bash
python3 "/Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py" "Refactor" "统一内部包名与桌面打包身份为 suihui" "可能影响构建脚本、协议唤起与更新源；需关注路径与依赖引用是否遗漏" "S2"
```

**Step 3: Commit**

```bash
git add docs/AI_CHANGELOG.md
git commit -m "chore: record suihui rename changes"
```
