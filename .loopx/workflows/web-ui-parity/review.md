---
slug: web-ui-parity
artifact: review
status: no-go
reviewed_at: 2026-05-09 01:12:00 CST
---

# Review: Web UI Parity

## Verdict

no-go

## Rationale

用户真实打开远程 Web 后发现两个严重问题：页面打开后会把文章连续标记为已读；“全部已读”类操作没有足够的二次确认保护。同时，当前 Web UI 仍是独立 remote shell 风格，没有达到“和桌面端一致 / 复刻桌面端 UI”的验收要求。

数据安全问题已做热修，但本轮 Web UI parity 仍不能按完成放行。

## Findings

1. 高 - 远程 Web 阅读面板之前在 `entryId` 变化后自动调用 `unreadSyncService.markRead(entryId)`，会导致打开 Web、自动预选、unread-only 连续推进时被动写入已读状态。该问题已在 `apps/desktop/layer/renderer/src/remote/remote-app.tsx` 和 `apps/desktop/layer/renderer/src/remote/remote-view-model.ts` 中热修，并补充回归测试。

2. 中等 - “全部已读”按钮路径存在直接执行批量已读的入口。已将 `MarkAllReadButton` 和 `FlatMarkAllReadButton` 统一改为 3 秒延迟确认 / 可撤销 toast 后再执行。

3. 高 - 当前远程 Web UI 仍不是桌面端 UI 复刻。它是新写的 remote 三栏壳和管理抽屉，视觉、组件行为、设置/阅读细节都没有达到用户要求的桌面端一致性。该项未完成，需要重新按桌面端组件/布局复用方向实现，而不是继续微调当前粗糙界面。

## Evidence

- 已补充测试：`apps/desktop/layer/renderer/src/remote/remote-view-model.test.ts`
- 已执行：
  - `pnpm --filter @suhui/web exec vitest --run src/remote/remote-view-model.test.ts src/remote/entry-navigation.test.ts`
  - `pnpm --filter @suhui/web typecheck`
  - `pnpm --filter suhui build:render`

## Rollback / Next Guidance

- 不建议回滚数据安全热修。
- Web UI parity 不能继续标记为完成；下一步应重新做桌面端 UI 复刻方案，优先复用桌面现有 reader/sidebar/list/content/settings 组件或抽公共适配层，而不是维护当前独立 remote UI。
