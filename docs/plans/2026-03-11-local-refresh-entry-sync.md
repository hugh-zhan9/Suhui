# 本地刷新后同步条目到前端 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 本地刷新后立即同步该订阅条目到前端，无需重启。  
**Architecture:** 刷新成功后由前端主动调用 `entrySyncServices.fetchEntries({ feedId })` 从本地 DB 拉取并更新 store，不改 IPC 协议。  
**Tech Stack:** Electron renderer, React, Zustand, Vitest

---

### Task 0: 创建隔离工作区（如果当前工作区已脏）

**Files:**
- Create: (new worktree dir)

**Step 1: 创建 worktree**

Run:
```bash
git worktree add ../FreeFoloRss-refresh-entry-sync -b fix/local-refresh-entry-sync
```

Expected: 新目录创建成功，分支 `fix/local-refresh-entry-sync` 存在。

**Step 2: 进入 worktree**

Run:
```bash
cd ../FreeFoloRss-refresh-entry-sync
```

Expected: 当前目录为新 worktree。

---

### Task 1: 写失败测试（验证刷新后会触发条目拉取）

**Files:**
- Create: `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts`

**Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from "vitest"

import { refreshLocalFeedAndSyncEntries } from "./entry-refresh"

describe("refreshLocalFeedAndSyncEntries", () => {
  it("calls ipc refresh then fetchEntries", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const fetchEntries = vi.fn().mockResolvedValue({ data: [] })

    await refreshLocalFeedAndSyncEntries({
      feedId: "local_feed_1",
      ipc: { invoke },
      fetchEntries,
    })

    expect(invoke).toHaveBeenCalledWith("db.refreshFeed", "local_feed_1")
    expect(fetchEntries).toHaveBeenCalledWith({ feedId: "local_feed_1" })
    expect(invoke.mock.invocationCallOrder[0]).toBeLessThan(
      fetchEntries.mock.invocationCallOrder[0],
    )
  })
})
```

**Step 2: 运行测试确认失败**

Run:
```bash
pnpm vitest apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts
```

Expected: FAIL，提示 `Cannot find module './entry-refresh'`。

---

### Task 2: 实现最小代码让测试通过

**Files:**
- Create: `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts`
- Test: `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts`

**Step 1: 写最小实现**

```ts
type IpcInvoker = {
  invoke: (channel: string, ...args: any[]) => Promise<unknown>
}

type FetchEntries = (args: { feedId: string }) => Promise<unknown>

export const refreshLocalFeedAndSyncEntries = async ({
  feedId,
  ipc,
  fetchEntries,
}: {
  feedId: string
  ipc: IpcInvoker
  fetchEntries: FetchEntries
}) => {
  await ipc.invoke("db.refreshFeed", feedId)
  await fetchEntries({ feedId })
}
```

**Step 2: 运行测试确认通过**

Run:
```bash
pnpm vitest apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts
```

Expected: PASS。

**Step 3: 提交**

```bash
git add apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts \
  apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts
git commit -m "test: add local refresh sync helper"
```

---

### Task 3: 接入 EntryListHeader 刷新流程

**Files:**
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/layouts/EntryListHeader.tsx`

**Step 1: 更新实现**

在文件顶部新增导入：
```ts
import { entrySyncServices } from "@follow/store/entry/store"
```

新增导入：
```ts
import { refreshLocalFeedAndSyncEntries } from "./entry-refresh"
```

在 `handleRefetch` 的本地刷新分支替换为：
```ts
if (canRefreshLocalFeed) {
  setIsLocalRefreshing(true)
  try {
    await refreshLocalFeedAndSyncEntries({
      feedId,
      ipc,
      fetchEntries: entrySyncServices.fetchEntries.bind(entrySyncServices),
    })
  } finally {
    setIsLocalRefreshing(false)
  }
}
```

**Step 2: 运行测试确认通过**

Run:
```bash
pnpm vitest apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts
```

Expected: PASS。

**Step 3: 提交**

```bash
git add apps/desktop/layer/renderer/src/modules/entry-column/layouts/EntryListHeader.tsx
git commit -m "fix: sync local entries after refresh"
```

---

### Task 4: 运行飞行记录（flight-recorder）

**Files:**
- Update: `docs/AI_CHANGELOG.md`

**Step 1: 记录变更**

Run:
```bash
python3 "/Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py" \
  "Bugfix" \
  "本地刷新后同步条目到前端，避免重启后才出现" \
  "刷新后额外拉取本地条目，增加一次本地读取，可能带来轻微性能开销" \
  "S2" \
  "apps/desktop/layer/renderer/src/modules/entry-column/layouts/EntryListHeader.tsx,apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts,apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts"
```

Expected: AI_CHANGELOG 追加一条记录。

---

### Task 5: 最终验证

**Step 1: 启动应用验证**

Run:
```bash
pnpm --filter suhui dev:electron
```

Expected: 本地刷新后无需重启即可看到新条目。
