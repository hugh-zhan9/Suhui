# RSSHub External-Only 分支合并实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不污染当前主工作区的前提下，将 `plan-rsshub-external-only` 分支安全合并到 `main`，并完成必要审查与验证。

**Architecture:** 使用独立干净的 `main` worktree 执行合并与测试；先在功能分支完成 code review，再在合并结果上二次验证测试，最后按选择进行清理。

**Tech Stack:** git, pnpm, vitest, node test

---

### Task 1: 预检与范围确认

**Files:**
- Modify: None
- Test: None

**Step 1: 确认分支与 worktree 状态**

Run: `git worktree list`
Expected: 能看到 `plan-rsshub-external-only` worktree，且当前主工作区仍有未提交变更。

**Step 2: 记录需合并范围**

Run: `git log --oneline main..plan-rsshub-external-only`
Expected: 显示本次需要合并的提交列表。

---

### Task 2: 合并前代码审查（requesting-code-review）

**Files:**
- Modify: None
- Test: None

**Step 1: 计算 base/head**

Run:
- `BASE_SHA=$(git merge-base plan-rsshub-external-only main)`
- `HEAD_SHA=$(git rev-parse plan-rsshub-external-only)`
Expected: 得到 base/head SHA。

**Step 2: 触发 code review**

Run:
- `git diff --stat $BASE_SHA..$HEAD_SHA`
- `git diff $BASE_SHA..$HEAD_SHA`
Expected: 生成审查 diff。

**Step 3: 形成审查结论**

Action: 使用 `requesting-code-review` + `code-reviewer` 产出审查报告，若存在 Critical/Important 必须先修复。

---

### Task 3: 功能分支测试复核

**Files:**
- Modify: None
- Test: `apps/desktop/layer/main/src/ipc/services/rsshub-url.test.ts`, `apps/desktop/layer/main/src/ipc/services/rsshub-external.test.ts`, `apps/desktop/layer/renderer/src/lib/rsshub-local-error.test.ts`, `apps/desktop/layer/renderer/src/modules/subscription-column/rsshub-precheck.test.ts`, `apps/desktop/layer/renderer/src/modules/discover/rsshub-recovery.test.ts`, `apps/desktop/scripts/packaging/rsshub-removed.test.ts`

**Step 1: 运行主进程/渲染层相关测试**

Run:
- `pnpm vitest --config apps/desktop/layer/main/vitest.config.ts apps/desktop/layer/main/src/ipc/services/rsshub-url.test.ts apps/desktop/layer/main/src/ipc/services/rsshub-external.test.ts --run`
- `pnpm vitest --config apps/desktop/layer/renderer/vitest.config.ts apps/desktop/layer/renderer/src/lib/rsshub-local-error.test.ts apps/desktop/layer/renderer/src/modules/subscription-column/rsshub-precheck.test.ts apps/desktop/layer/renderer/src/modules/discover/rsshub-recovery.test.ts --run`
Expected: 全部 PASS。

**Step 2: 运行打包相关测试**

Run: `node --test apps/desktop/scripts/packaging/rsshub-removed.test.ts`
Expected: PASS。

---

### Task 4: 在干净 main worktree 合并

**Files:**
- Modify: None（合并会引入已存在提交）
- Test: 同 Task 3

**Step 1: 创建干净 main worktree**

Run: `git worktree add .worktrees/main-merge main`
Expected: 新建干净 main worktree。

**Step 2: 合并分支**

Run:
- `cd .worktrees/main-merge`
- `git merge plan-rsshub-external-only`
Expected: 快进或正常合并成功。

**Step 3: 合并后测试复核**

Run: 同 Task 3 的测试命令
Expected: 全部 PASS。

**Step 4: 合并后变更记录**

Action: 若产生新的合并提交或额外修复代码，按 `flight-recorder` 追加记录；仅快进且无新增逻辑则保持现有记录不重复追加。

---

### Task 5: 清理与收尾

**Files:**
- Modify: None
- Test: None

**Step 1: 清理工作树（如选择合并完成）**

Run: `git worktree remove .worktrees/main-merge`
Expected: 清理干净 main worktree。

**Step 2: 处理功能分支**

Action: 若确认无后续用途，删除 `plan-rsshub-external-only` 分支；否则保留。
