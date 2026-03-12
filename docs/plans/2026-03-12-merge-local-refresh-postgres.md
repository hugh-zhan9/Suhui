# Local Refresh + Postgres Alignment Merge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the verified local refresh + Postgres-only alignment changes back to `main` safely and clean up the worktree.

**Architecture:** No product logic changes; this is a merge workflow with validation and workspace hygiene. Ensure tests pass before integrating and remove temporary backup files.

**Tech Stack:** Git, pnpm, monorepo workspace.

---

### Task 1: Pre-merge hygiene and validation

**Files:**

- Modify: `AGENTS.md.bak.20260311195347`
- Modify: `CLAUDE.md.bak.20260311195347`
- Modify: `GEMINI.md.bak.20260311195347`

**Step 1: Remove backup files**

```bash
rm AGENTS.md.bak.20260311195347 CLAUDE.md.bak.20260311195347 GEMINI.md.bak.20260311195347
```

**Step 2: Verify worktree status**

Run: `git status -sb`
Expected: no unexpected changes beyond planned deletions.

**Step 3: Verify tests in feature worktree**

Run: `pnpm test`
Expected: PASS.

### Task 2: Merge to main

**Files:**

- Modify: `.` (git history)

**Step 1: Switch to base branch**

```bash
git checkout main
```

**Step 2: Pull latest**

```bash
git pull
```

**Step 3: Merge feature branch**

```bash
git merge fix/local-refresh-entry-sync
```

**Step 4: Verify tests on merged result**

Run: `pnpm test`
Expected: PASS.

### Task 3: Cleanup

**Files:**

- Modify: `.` (git history)

**Step 1: Remove merged branch**

```bash
git branch -d fix/local-refresh-entry-sync
```

**Step 2: Remove worktree**

```bash
git worktree remove /Users/zhangyukun/project/FreeFoloRss/.worktrees/fix/local-refresh-entry-sync
```
