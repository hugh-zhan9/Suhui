# No-Sign 打包产物 ad-hoc 重签名 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复无签名 macOS 打包产物因资源清理导致的签名损坏问题，使 `.app` 能被 Finder 正常启动。

**Architecture:** 在 Electron Forge 的 `postPackage` 阶段对 no-sign 的最终 `.app` 做一次 ad-hoc 重签名。通过 helper 函数锁定触发条件，并用测试覆盖条件判断。

**Tech Stack:** Electron Forge、TypeScript、Vitest、macOS codesign

---

### Task 1: 写触发条件失败测试

**Files:**

- Create: `apps/desktop/scripts/packaging/adhoc-sign.test.ts`
- Create: `apps/desktop/scripts/packaging/adhoc-sign.ts`

**Step 1: Write the failing test**

- 测试 macOS + no-sign 时返回 `true`
- 测试非 macOS 或非 no-sign 时返回 `false`

**Step 2: Run test to verify it fails**

- Run: `pnpm --filter suhui test -- --run apps/desktop/scripts/packaging/adhoc-sign.test.ts`
- Expected: FAIL，提示模块不存在

**Step 3: Write minimal implementation**

- 实现 helper，仅返回布尔值

**Step 4: Run test to verify it passes**

- 同上命令，Expected: PASS

### Task 2: 接入 forge postPackage

**Files:**

- Modify: `apps/desktop/forge.config.cts`
- Modify: `apps/desktop/scripts/packaging/adhoc-sign.ts`

**Step 1: Add postPackage hook**

- 在 no-sign macOS 下执行 ad-hoc codesign
- 失败直接抛错

**Step 2: Run targeted test**

- Run: `pnpm --filter suhui test -- --run apps/desktop/scripts/packaging/adhoc-sign.test.ts`
- Expected: PASS

### Task 3: 实证验证与记录

**Files:**

- Modify: `docs/AI_CHANGELOG.md`

**Step 1: Repackage app**

- Run: `FOLO_NO_SIGN=1 pnpm --filter suhui exec electron-forge package`
- Expected: PASS

**Step 2: Verify packaged app**

- Run: `codesign --verify --deep --strict /tmp/suhui-forge-out/溯洄-darwin-arm64/溯洄.app`
- Expected: no output

**Step 3: Replace app and verify launch**

- 覆盖 `/Applications/溯洄.app`
- Run: `open -a /Applications/溯洄.app`

**Step 4: Record flight-recorder**

- 用 skill 脚本记录中文变更
