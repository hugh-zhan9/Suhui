# Packaged 窗口创建链路诊断 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 packaged 启动链路增加窗口级诊断日志，定位打包版“有进程无窗口”的根因。

**Architecture:** 在主进程 `BootstrapManager` 和 `WindowManager` 的关键节点打日志，并在 packaged 模式下显式执行 `center/show/focus`。优先通过日志定位，不改业务行为。

**Tech Stack:** Electron、TypeScript、Vitest、electron-log

---

### Task 1: 写最小失败测试

**Files:**

- Create: `apps/desktop/layer/main/src/manager/window-diagnostics.test.ts`
- Create: `apps/desktop/layer/main/src/manager/window-diagnostics.ts`

**Step 1: Write the failing test**

- 测试诊断 helper 会输出 bounds、visibility、destroyed 状态

**Step 2: Run test to verify it fails**

- Run: `pnpm --filter @suhui/electron-main test --run src/manager/window-diagnostics.test.ts`
- Expected: FAIL

**Step 3: Write minimal implementation**

- 实现纯函数 helper

**Step 4: Run test to verify it passes**

- 同上命令，Expected: PASS

### Task 2: 接入窗口链路诊断

**Files:**

- Modify: `apps/desktop/layer/main/src/manager/bootstrap.ts`
- Modify: `apps/desktop/layer/main/src/manager/window.ts`
- Modify: `apps/desktop/layer/main/src/manager/window-diagnostics.ts`

**Step 1: Add lifecycle logs**

- 记录 DB/Sync/窗口/renderer 关键阶段

**Step 2: Add packaged show/focus/center safeguard**

- 仅 packaged 模式执行，减少对 dev 的干扰

**Step 3: Run targeted tests**

- Run: `pnpm --filter @suhui/electron-main test --run src/manager/window-diagnostics.test.ts`
- Expected: PASS

### Task 3: 全量验证与记录

**Files:**

- Modify: `docs/AI_CHANGELOG.md`

**Step 1: Run main tests**

- Run: `pnpm --filter @suhui/electron-main test`
- Expected: PASS

**Step 2: Record flight-recorder**

- 用 skill 脚本追加中文记录
