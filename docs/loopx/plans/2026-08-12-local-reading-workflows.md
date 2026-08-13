---
source: docs/loopx/design/2026-08-12-local-reading-workflows/需求设计文档.md
status: ready
slices:
  - id: P-001
    status: done
    depends: []
  - id: P-002
    status: done
    depends: [P-001]
  - id: P-003
    status: done
    depends: [P-001]
  - id: P-004
    status: done
    depends: [P-001]
  - id: P-005
    status: done
    depends: [P-002, P-003, P-004]
  - id: P-006
    status: done
    depends: [P-005]
---

# Suhui Local Reading Workflows

## Goal And Boundaries

交付完全本地、可备份恢复的订阅工作流：本地 OPML、重复内容聚类、只默认处理新文章的规则、逐篇笔记/高亮、独立稍后读队列，并让 Desktop 与 Remote 使用相同 application service 和 PostgreSQL 真相源。

聚类只折叠不删除；逐篇状态不跨聚类传播。合并恢复不删除，完整替换必须安全快照、确认和事务回滚。规则历史应用必须先预览。文章标签不修改订阅分类。已读、收藏与队列互不联动。现有未提交用户改动不属于本计划，不得覆盖。

## P-001 持久化与共享领域基础

新增 additive PostgreSQL schema、迁移、数据库服务与共享 DTO，覆盖聚类、规则应用、文章状态/标签、笔记、高亮和阅读队列。已有数据库迁移后原有条目、订阅、收藏和已读状态不变；新表的主键、唯一约束和访问路径可由测试证明。

> writes: `packages/internal/database/src/schemas/**`, `packages/internal/database/src/db.main.ts`, `packages/internal/database/src/services/**`, `packages/internal/database/src/drizzle/**`, `apps/desktop/layer/main/src/application/local-reading/**`
> anchors: `AC-004..AC-011`, `D-004..D-010`, `TC-009`
> verify: `pnpm --filter @suhui/database test && pnpm --filter suhui-main test -- src/manager/db-schema.test.ts src/application/local-reading`
> review: schema semantics、migration repeatability、user-owned 与 derived data 边界

## P-002 可恢复备份与本地 OPML

实现 v1 流式 bundle writer/validator/reader、合并恢复、完整替换确认/安全快照/失败回滚，以及离线 OPML 2.0 解析、选择性导入与导出。损坏或未知格式在任何写入前拒绝；旧 JSON 仅作为 legacy merge 输入。

> writes: `apps/desktop/layer/main/src/application/backup/**`, `apps/desktop/layer/main/src/application/opml/**`, `apps/desktop/layer/main/src/ipc/services/**backup*`, `apps/desktop/layer/main/src/ipc/services/**opml*`, `apps/desktop/layer/main/src/remote/**`, `packages/internal/store/src/runtime/client.ts`
> anchors: `AC-001..AC-003`, `D-001..D-003`, `TC-001..TC-003`
> verify: `pnpm --filter suhui-main test -- src/application/backup src/application/opml src/remote/manager.test.ts`
> review: destructive replace confirmation、transaction rollback、backup privacy、format compatibility

## P-003 聚类与规则处理流水线

实现确定性指纹、聚类/拆分/代表选择、历史重建，以及规则 CRUD、新文章幂等应用、历史预览 token/确认执行和文章标签/隐藏。刷新条目持久化成功优先，派生失败可重跑且不丢文章。

> writes: `apps/desktop/layer/main/src/application/dedup/**`, `apps/desktop/layer/main/src/application/rules/**`, `apps/desktop/layer/main/src/manager/feed-refresh.ts`, `apps/desktop/layer/main/src/remote/**`, `packages/internal/store/src/runtime/client.ts`
> anchors: `AC-004..AC-006`, `D-004..D-007`, `D-012`, `TC-004..TC-006`
> verify: `pnpm --filter suhui-main test -- src/application/dedup src/application/rules src/manager/feed-refresh.test.ts src/remote/manager.test.ts`
> review: no deletion/state propagation、rule idempotency、preview/execute TOCTOU、derived failure isolation

## P-004 注释与阅读队列

实现笔记、高亮、quote/context 重定位与 orphan 状态，以及独立队列状态机、列表和统计。所有操作绑定原始 entry，重复请求幂等，已读和收藏不改变队列。

> writes: `apps/desktop/layer/main/src/application/annotations/**`, `apps/desktop/layer/main/src/application/reading-queue/**`, `apps/desktop/layer/main/src/remote/**`, `packages/internal/store/src/runtime/client.ts`
> anchors: `AC-007..AC-010`, `D-008..D-011`, `TC-007..TC-009`
> verify: `pnpm --filter suhui-main test -- src/application/annotations src/application/reading-queue src/remote/manager.test.ts`

## P-005 Desktop/Remote 用户工作流与查询集成

Desktop 提供数据管理、规则管理、文章标签/注释、重复来源和稍后读入口；Remote 提供核心等价操作。普通列表默认隐藏被规则隐藏的文章并折叠聚类，管理/搜索路径可访问原始条目。现有 cursor、scope、详情、已读和收藏保持兼容。

> writes: `apps/desktop/layer/renderer/src/modules/**`, `apps/desktop/layer/renderer/src/remote/**`, `apps/desktop/layer/renderer/src/atoms/**`, `apps/desktop/layer/main/src/application/entry/**`, `packages/internal/store/src/**`
> anchors: `AC-003..AC-010`, `D-003..D-011`, `TC-003..TC-009`
> verify: `pnpm --filter suhui-renderer test && pnpm --filter suhui-main test -- src/application/entry src/remote`
> review: Desktop/Remote parity、accessibility、query compatibility、hidden/search escape hatch

## P-006 集成验证与当前文档

补齐跨域 round-trip、真实 PostgreSQL migration/transport parity、构建类型检查与当前上下文文档。验证备份覆盖全部新增用户数据，派生聚类可重建，原有本地 RSS 主链路无回归。

> writes: `README.md`, `AI-CONTEXT.md`, `docs/README.md`, `docs/iteration-direction.md`, `apps/desktop/**.test.*`, `packages/internal/**.test.*`, `docs/loopx/plans/2026-08-12-local-reading-workflows.md`
> anchors: `AC-001..AC-011`, `D-001..D-012`, `TC-001..TC-009`
> verify: `pnpm test && pnpm typecheck && pnpm --filter suhui build:electron`
> review: exact final diff independent review for public compatibility and destructive restore behavior

## Integration And Final Verification

- 从现有数据库升级并运行全仓测试、typecheck 和 Electron build。
- 用 fixture 执行完整 bundle round-trip、损坏拒绝、merge non-delete 和 replace rollback。
- 验证刷新产生聚类/规则状态，Desktop 与 Remote 读取一致。
- 验证笔记、高亮、标签、规则与队列全部随备份恢复，聚类 rebuild 不覆盖人工代表。
- 更新当前文档，删除 Remote 功能缺口的过时描述。

## Handoff And Residual Risks

- Blockers: none
- Residual risks: 内容聚类阈值需在真实订阅数据上调校；完整替换恢复在超大数据库上的磁盘占用需实测。
- Resume note: 从 frontmatter 第一个非 done slice 继续，先读取该 slice 的 anchors 与 verify。
