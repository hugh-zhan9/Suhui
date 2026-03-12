# Packaged 启动早期诊断 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为打包版主进程增加独立 `boot.log`，定位启动卡死发生的具体阶段。

**Architecture:** 在主进程最早入口使用同步文件写入，不依赖 `electron-log`。通过少量关键检查点串起 `bootstrap.ts` 与 `BootstrapManager.start()` 的启动路径。

**Tech Stack:** Electron、TypeScript、Vitest、Node fs/path/os

---

### Task 1: 添加 boot log 单测

**Files:**

- Create: `apps/desktop/layer/main/src/manager/boot-log.test.ts`
- Create: `apps/desktop/layer/main/src/manager/boot-log.ts`

**Step 1: Write the failing test**

- 验证 `appendBootLog()` 会创建目录、追加两行、包含阶段名与 JSON 元数据。

**Step 2: Run test to verify it fails**

- Run: `pnpm --filter @suhui/electron-main test --run src/manager/boot-log.test.ts`
- Expected: FAIL，提示模块不存在或导出缺失。

**Step 3: Write minimal implementation**

- 实现同步写盘 helper，失败时静默返回。

**Step 4: Run test to verify it passes**

- 同上命令，Expected: PASS

### Task 2: 在启动入口接入 boot log

**Files:**

- Modify: `apps/desktop/layer/main/src/bootstrap.ts`
- Modify: `apps/desktop/layer/main/src/manager/bootstrap.ts`

**Step 1: Write minimal wiring**

- 在关键阶段调用 `appendBootLog()`。

**Step 2: Run targeted tests**

- Run: `pnpm --filter @suhui/electron-main test --run src/manager/boot-log.test.ts`
- Expected: PASS

### Task 3: 全量验证与记录

**Files:**

- Modify: `docs/AI_CHANGELOG.md`

**Step 1: Run main tests**

- Run: `pnpm --filter @suhui/electron-main test`
- Expected: PASS

**Step 2: Record flight-recorder**

- 用 skill 脚本追加中文变更记录。
