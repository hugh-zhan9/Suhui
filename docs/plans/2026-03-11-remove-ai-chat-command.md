# Remove AI Chat Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 彻底删除“全局 AI 聊天”命令与快捷键，并保证设置页不再出现相关快捷键配置项。

**Architecture:** 直接从命令系统与快捷键绑定中移除 `global:toggle-ai-chat`，命令列表驱动的设置页将自动消失该项。通过单元测试保证默认快捷键与命令 ID 不再包含该命令。

**Tech Stack:** TypeScript, React, Jotai, Vitest

---

### Task 1: 添加失败测试（命令与快捷键已移除）

**Files:**

- Create: `apps/desktop/layer/renderer/src/modules/command/hooks/use-command-binding.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"

import { COMMAND_ID } from "../commands/id"
import { defaultCommandShortcuts } from "./use-command-binding"

describe("command shortcuts", () => {
  it("does not expose ai chat command id", () => {
    const removedId = "global:toggle-ai-chat"
    expect(Object.values(COMMAND_ID.global)).not.toContain(removedId)
  })

  it("does not include ai chat in default shortcuts", () => {
    const removedId = "global:toggle-ai-chat"
    expect(Object.keys(defaultCommandShortcuts)).not.toContain(removedId)
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run -c apps/desktop/layer/renderer/vitest.config.ts apps/desktop/layer/renderer/src/modules/command/hooks/use-command-binding.test.ts
```

Expected: FAIL，提示 `global:toggle-ai-chat` 仍在命令或默认快捷键中。

**Step 3: Commit**

```bash
git add apps/desktop/layer/renderer/src/modules/command/hooks/use-command-binding.test.ts
git commit -m "test: assert ai chat command removed"
```

---

### Task 2: 移除命令、热键与注册逻辑

**Files:**

- Modify: `apps/desktop/layer/renderer/src/modules/command/commands/id.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/command/commands/global.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/command/hooks/use-command-binding.ts`
- Modify: `apps/desktop/layer/renderer/src/providers/main-view-hotkeys-provider.tsx`

**Step 1: Write minimal implementation**

- 从 `COMMAND_ID.global` 中移除 `toggleAIChat`。
- 从 `useRegisterGlobalCommands` 中移除该命令注册与相关类型。
- 从 `defaultCommandShortcuts` 中移除 `global:toggle-ai-chat` 绑定。
- 从 `MainViewHotkeysProvider` 中移除该命令绑定。
- 清理无用 import/类型联合。

**Step 2: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run -c apps/desktop/layer/renderer/vitest.config.ts apps/desktop/layer/renderer/src/modules/command/hooks/use-command-binding.test.ts
```

Expected: PASS

**Step 3: Sanity check no references remain**

Run:

```bash
rg -n "toggleAIChat|global:toggle-ai-chat" apps/desktop/layer/renderer/src
```

Expected: no matches.

**Step 4: Commit**

```bash
git add apps/desktop/layer/renderer/src/modules/command/commands/id.ts \
  apps/desktop/layer/renderer/src/modules/command/commands/global.tsx \
  apps/desktop/layer/renderer/src/modules/command/hooks/use-command-binding.ts \
  apps/desktop/layer/renderer/src/providers/main-view-hotkeys-provider.tsx

git commit -m "feat: remove ai chat command and hotkey"
```
