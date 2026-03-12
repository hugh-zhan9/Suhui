# Discover Main Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Discover/Trending 改为通过主进程代理访问旧 API，修复 packaged 模式下趋势和分类无数据的问题。

**Architecture:** 在 main IPC 中新增 discover 服务，封装对 `https://api.folo.is` 的 GET 请求；renderer 查询层改调 `ipcServices.discover.*`。保留现有 UI，不再依赖 renderer 直连跨域接口。

**Tech Stack:** Electron IPC, TypeScript, Vitest, native fetch

---

### Task 1: 为主进程 discover 代理写失败测试

- Files:
  - Create: `apps/desktop/layer/main/src/ipc/services/discover.test.ts`
  - Modify: `apps/desktop/layer/main/src/ipc/index.ts`
- Step 1: 写测试，约束 discover service 能代理 trending/rsshub/rsshubAnalytics/rsshubRoute。
- Step 2: 跑测试确认失败。
- Step 3: 最小实现。
- Step 4: 再跑测试确认通过。

### Task 2: renderer 改走 IPC 查询

- Files:
  - Modify: `apps/desktop/layer/renderer/src/modules/trending/index.tsx`
  - Modify: `apps/desktop/layer/renderer/src/queries/discover.ts`
  - Modify: `apps/desktop/layer/renderer/src/lib/discover-client.test.ts`
- Step 1: 先加/改测试约束不再依赖 discoverClient。
- Step 2: 最小改实现，改走 `ipcServices.discover.*`。
- Step 3: 跑 renderer 测试。

### Task 3: 全量验证与记录

- Step 1: `pnpm --filter @suhui/electron-main test`
- Step 2: `pnpm --filter ./apps/desktop/layer/renderer test`
- Step 3: flight-recorder
