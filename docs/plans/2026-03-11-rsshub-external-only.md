# RSSHub External-Only Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除内置 RSSHub 运行时与 Lite/Official 模式，保留 `rsshub://` 与 `rsshub.app` 订阅但全部改写到用户配置的外部 RSSHub；未配置时弹窗引导，并可一次性使用 `https://rsshub.app`。

**Architecture:** 主进程只负责 URL 改写与错误码输出，不再拉起本地 runtime。渲染层在遇到“未配置外部 RSSHub”错误时弹窗引导设置，并可触发一次性“官方默认”重试。

**Tech Stack:** Electron (main/renderer), TypeScript, React, electron-ipc-decorator

---

## Task 1: 调整 RSSHub URL 解析为“外部优先”语义

**Files:**

- Modify: `apps/desktop/layer/main/src/ipc/services/rsshub-url.ts`
- Modify: `apps/desktop/layer/main/src/ipc/services/rsshub-url.test.ts`

**Step 1: Write the failing test**

更新 `rsshub-url.test.ts`，新增用例：

- 未配置外部 RSSHub 时，`rsshub://` 或 `https://rsshub.app/...` 抛 `RSSHUB_EXTERNAL_UNCONFIGURED`。
- 配置 `customBaseUrl` 后，`rsshub://github/trending` 改写到 `<customBaseUrl>/github/trending`。
- 允许 `allowPublicFallback` 时，未配置外部也改写到 `https://rsshub.app/...`。

```ts
// 新增测试示例（按现有测试风格写）
expect(() =>
  resolveRsshubUrl({
    url: "rsshub://github/trending",
    customHosts: [],
    customBaseUrl: "",
    allowPublicFallback: false,
  }),
).toThrow(/RSSHUB_EXTERNAL_UNCONFIGURED/)

const withCustom = resolveRsshubUrl({
  url: "rsshub://github/trending?since=daily",
  customHosts: [],
  customBaseUrl: "https://rsshub.myself.dev",
  allowPublicFallback: false,
})
expect(withCustom.resolvedUrl).toBe("https://rsshub.myself.dev/github/trending?since=daily")
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @follow/monorepo test --filter apps/desktop/layer/main/src/ipc/services/rsshub-url.test.ts`
Expected: FAIL (API 变更尚未实现)

**Step 3: Write minimal implementation**

在 `rsshub-url.ts` 调整 API：

```ts
export type ResolveRsshubUrlInput = {
  url: string
  customHosts: string[]
  customBaseUrl?: string | null
  allowPublicFallback?: boolean
}

export const resolveRsshubUrl = ({
  url,
  customHosts,
  customBaseUrl,
  allowPublicFallback,
}: ResolveRsshubUrlInput) => {
  // 识别 rsshub:// 与 rsshub.app
  // 自定义 host 直接 passthrough
  // customBaseUrl 存在时改写到 customBaseUrl
  // 否则 allowPublicFallback ? https://rsshub.app : throw RSSHUB_EXTERNAL_UNCONFIGURED
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @follow/monorepo test --filter apps/desktop/layer/main/src/ipc/services/rsshub-url.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/layer/main/src/ipc/services/rsshub-url.ts apps/desktop/layer/main/src/ipc/services/rsshub-url.test.ts
git commit -m "refactor: resolve rsshub url via external base"
```

**Step 6: Flight recorder**

Run: `python /Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py`

---

## Task 2: 主进程移除内置 RSSHub 依赖并接入外部改写

**Files:**

- Modify: `apps/desktop/layer/main/src/ipc/services/db.ts`
- Modify: `apps/desktop/layer/main/src/ipc/services/setting.ts`
- Delete: `apps/desktop/layer/main/src/manager/rsshub.ts`
- Delete: `apps/desktop/layer/main/src/manager/rsshub-autostart.ts`
- Delete: `apps/desktop/layer/main/src/manager/rsshub-runtime-mode.ts`
- Modify: `apps/desktop/layer/main/src/manager/bootstrap.ts`
- Delete/Modify tests: `apps/desktop/layer/main/src/manager/rsshub.test.ts`

**Step 1: Write the failing test**

- 新增或更新 `db.ts` 相关测试（可在 `apps/desktop/layer/main/src/ipc/services` 下新建 `rsshub-external.test.ts`），验证：
  - `rsshub.app` 在无配置时返回 `RSSHUB_EXTERNAL_UNCONFIGURED`。
  - 传入 `allowPublicFallback` 后可请求 `https://rsshub.app`。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @follow/monorepo test --filter rsshub-external.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `db.ts`：
  - 移除 `rsshubManager` / `loadLiteSupportedRoutes` / `shouldUseLocalRsshubRuntime` 相关逻辑。
  - 读取 `rsshubCustomUrl` 并传给 `resolveRsshubUrl`：

```ts
const customUrl = store.get("rsshubCustomUrl") ?? ""
const { resolvedUrl } = resolveRsshubUrl({
  url: feedUrl,
  customHosts,
  customBaseUrl: customUrl,
  allowPublicFallback: form.allowPublicRsshub === true,
})
```

- `setting.ts`：移除 `getRsshubAutoStart` / `setRsshubAutoStart` / `getRsshubRuntimeMode` / `setRsshubRuntimeMode` / `getRsshubTwitterCookie` / `setRsshubTwitterCookie` 以及对应依赖。
- `bootstrap.ts`：移除 RSSHub autostart 与 runtime-mode 初始化。
- 删除 `manager/rsshub*.ts` 及相关测试。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @follow/monorepo test --filter rsshub-external.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/layer/main/src/ipc/services/db.ts \
  apps/desktop/layer/main/src/ipc/services/setting.ts \
  apps/desktop/layer/main/src/manager/bootstrap.ts \
  apps/desktop/layer/main/src/ipc/services/rsshub-url.ts \
  apps/desktop/layer/main/src/ipc/services/rsshub-url.test.ts \
  apps/desktop/layer/main/src/ipc/services/rsshub-external.test.ts
git rm apps/desktop/layer/main/src/manager/rsshub.ts \
  apps/desktop/layer/main/src/manager/rsshub-autostart.ts \
  apps/desktop/layer/main/src/manager/rsshub-runtime-mode.ts \
  apps/desktop/layer/main/src/manager/rsshub.test.ts
git commit -m "remove: local rsshub runtime from main process"
```

**Step 6: Flight recorder**

Run: `python /Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py`

---

## Task 3: 渲染层改造为外部 RSSHub 引导

**Files:**

- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/SimpleDiscoverModal.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/rsshub-precheck.ts`
- Modify: `apps/desktop/layer/renderer/src/lib/rsshub-local-error.ts`
- Modify: `apps/desktop/layer/renderer/src/lib/rsshub-local-error.test.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/settings/tabs/data-control.tsx`
- Modify/Delete: `apps/desktop/layer/renderer/src/modules/settings/tabs/rsshub-local-state.ts`
- Modify/Delete: `apps/desktop/layer/renderer/src/modules/settings/tabs/rsshub-local-state.test.ts`
- Modify/Delete: `apps/desktop/layer/renderer/src/modules/rsshub/LocalRsshubConsole.tsx`

**Step 1: Write the failing test**

- 更新 `rsshub-local-error.test.ts`：
  - 新增 `RSSHUB_EXTERNAL_UNCONFIGURED` 的友好提示。
  - 移除/调整 `RSSHUB_LOCAL_UNAVAILABLE` 的断言。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @follow/monorepo test --filter rsshub-local-error.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `rsshub-local-error.ts`：新增对 `RSSHUB_EXTERNAL_UNCONFIGURED` 的解析与提示文案（如“请配置外部 RSSHub 实例”）。
- `rsshub-precheck.ts`：移除本地运行时检查逻辑，改为检测 `rsshubCustomUrl` 是否配置；未配置直接抛 `RSSHUB_EXTERNAL_UNCONFIGURED`。
- `SimpleDiscoverModal.tsx`：捕获上述错误，弹出引导配置弹窗，用户可选择“继续一次（官方默认）”并重试调用 `previewFeed`，通过 `allowPublicRsshub` 传入。
- `data-control.tsx`：删除本地 RSSHub 状态展示，保留外部 RSSHub 配置入口。
- 删除 `rsshub-local-state.ts`/`LocalRsshubConsole.tsx` 相关 UI 与测试。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @follow/monorepo test --filter rsshub-local-error.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/layer/renderer/src/modules/subscription-column/SimpleDiscoverModal.tsx \
  apps/desktop/layer/renderer/src/modules/subscription-column/rsshub-precheck.ts \
  apps/desktop/layer/renderer/src/lib/rsshub-local-error.ts \
  apps/desktop/layer/renderer/src/lib/rsshub-local-error.test.ts \
  apps/desktop/layer/renderer/src/modules/settings/tabs/data-control.tsx
git rm apps/desktop/layer/renderer/src/modules/settings/tabs/rsshub-local-state.ts \
  apps/desktop/layer/renderer/src/modules/settings/tabs/rsshub-local-state.test.ts \
  apps/desktop/layer/renderer/src/modules/rsshub/LocalRsshubConsole.tsx
git commit -m "ui: switch rsshub flow to external-only"
```

**Step 6: Flight recorder**

Run: `python /Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py`

---

## Task 4: 移除内置 RSSHub 构建与资源

**Files:**

- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/forge.config.cts`
- Delete: `apps/desktop/scripts/build-rsshub.ts`
- Delete: `apps/desktop/scripts/rsshub-routes.ts`
- Delete: `apps/desktop/resources/rsshub/**`

**Step 1: Write the failing test**

- 新增一个构建脚本测试（可放 `apps/desktop/scripts/packaging/rsshub-removed.test.ts`）：
  - 断言 `build:electron:unsigned` 不再依赖 `build:rsshub`（例如通过读取 `apps/desktop/package.json` 的脚本值）。

**Step 2: Run test to verify it fails**

Run: `node --test apps/desktop/scripts/packaging/rsshub-removed.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `apps/desktop/package.json`：
  - 删除 `build:rsshub` 脚本。
  - 从 `build:electron*` 中移除 `pnpm build:rsshub &&` 前置。
- `forge.config.cts`：
  - 移除 `extraResource` 中的 `./resources/rsshub`。
- 删除 `resources/rsshub` 目录与构建脚本文件。

**Step 4: Run test to verify it passes**

Run: `node --test apps/desktop/scripts/packaging/rsshub-removed.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/forge.config.cts apps/desktop/scripts/packaging/rsshub-removed.test.ts
git rm apps/desktop/scripts/build-rsshub.ts apps/desktop/scripts/rsshub-routes.ts
rm -rf apps/desktop/resources/rsshub
git commit -m "build: remove embedded rsshub resources"
```

**Step 6: Flight recorder**

Run: `python /Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py`

---

## Task 5: 文档与回归说明

**Files:**

- Modify: `docs/AI_CHANGELOG.md`
- Modify: `AI-CONTEXT.md`（如需更新内置 RSSHub 描述）

**Step 1: Write the failing test**

不需要测试。

**Step 2: Write minimal implementation**

- 更新文档，说明外部 RSSHub 成为唯一模式；默认 `https://rsshub.app` 可能限流。

**Step 3: Commit**

```bash
git add docs/AI_CHANGELOG.md AI-CONTEXT.md
git commit -m "docs: note rsshub external-only mode"
```

**Step 4: Flight recorder**

Run: `python /Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py`

---

## Task 6: 最终验证

**Step 1: Run focused tests**

```bash
pnpm --filter @follow/monorepo test --filter rsshub-url.test.ts
pnpm --filter @follow/monorepo test --filter rsshub-local-error.test.ts
```

**Step 2: Run packaging dry-check (optional)**

```bash
pnpm --filter suhui build:electron:unsigned
```

**Step 3: Manual smoke**

- 订阅 `rsshub://github/trending`：未配置时弹窗 → 选择“继续一次”，能拉取（若被限流可接受）。
- 配置自建 RSSHub：再次订阅应成功。

---

## Notes

- 由于 worktree 中 `pnpm install` 的 `prepare` 阶段失败（`corepack` 缺失、`simple-git-hooks` 无法创建 hooks），基线测试未运行。执行计划前需用户确认继续或修复安装环境。
