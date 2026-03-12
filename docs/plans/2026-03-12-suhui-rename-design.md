# Suhui Rename & Packaging Identity Design

**Goal:** 统一内部 workspace 包名到 `@suhui/*`，并同步桌面打包身份（appId/协议/产物命名/更新源/资源 URL），同时先修复当前构建（tsc）失败。

**Scope:**

- 仅改内部 workspace 包名与引用（`@follow/*` -> `@suhui/*`）。外部依赖不改。
- 桌面构建与打包身份统一：
  - `appBundleId/appId` -> `io.suhui`
  - 协议 scheme -> `suhui`
  - 产物输出目录 -> `/tmp/suhui-forge-out`
  - 更新源与资源 URL -> `https://suhui.io`
- 先修复 `@follow/electron-main` tsc 构建失败，再做命名统一。

---

## Design

### 1) Build Failure First

- 先定位 `sqlite-postgres-migration.test.ts` 中 `Object is possibly 'undefined'` 的根因。
- 按 TDD 先写/调整用例，再做最小修复，确保 `pnpm --filter @follow/electron-main build` 通过。

### 2) Workspace 包名统一

- 将内部 workspace 包名统一为 `@suhui/*`。
- 全仓库引用同步调整（import/tsconfig paths/package.json 依赖）。
- 保持外部依赖（非 workspace）不变。

### 3) Electron 打包身份统一

- `forge.config.cts`:
  - `appBundleId` -> `io.suhui`
  - `protocols` -> 仅 `suhui`
  - `noSignOutDir` -> `/tmp/suhui-forge-out`
  - 产物命名逻辑使用 `productName` 不变，但确保输出路径同步
  - 更新源/资源 URL 统一为 `https://suhui.io`
- `generate-appx-manifest.ts`:
  - `protocols` -> `suhui`
  - `appBundleId` -> `io.suhui`
- `app.ts`:
  - `bundleId/chromeId` -> `io.suhui`

### 4) 风险与兼容性

- 移除 `follow://` 与 `folo://` 后，旧协议将无法唤起应用。
- 更新源切换后，旧更新渠道不可用。
- 包名统一后，所有 workspace 引用必须同步，否则构建会失败。

### 5) 验证

- `pnpm --filter @follow/electron-main build`
- `pnpm test`
- （用户要求）打包验证在合并后再进行。

---

## Non-Goals

- 不改外部依赖包名
- 不引入新功能
- 不做跨平台发布流程调整
