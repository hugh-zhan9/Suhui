# AI-CONTEXT.md

> 单一事实源（Single Source of Truth）  
> 最后更新时间：2026-02-25（本次为“二次深度代码复核”更新）

## 上下文委派策略

本仓库所有 AI 规则统一维护在 `AI-CONTEXT.md`。  
`AGENTS.md`、`GEMINI.md`、`CLAUDE.md` 仅作为指针文件，不维护独立规则。

## 当前仓库真实状态（代码层）

### 1) 端与工作区

- 当前仅保留 Desktop：`apps/desktop`
- `apps/mobile`、`apps/ssr` 已移除
- `pnpm-workspace.yaml` 为 desktop-only + packages

### 2) 产品目标

- 目标：**Desktop 端完全本地 RSS 阅读器**
- 不保留：登录强依赖、会员/计费、AI 在线能力、云端 API 强依赖

### 3) 本地数据面（关键结论）

- 主进程数据库：`better-sqlite3`，目标文件 `app.getPath("userData")/folo_local.db`
  - 入口：`apps/desktop/layer/main/src/manager/db.ts`
  - 启动初始化：`apps/desktop/layer/main/src/manager/bootstrap.ts`
- 渲染层数据库：`packages/internal/database/src/db.desktop.ts` 已改为 **IPC SQL 代理**（`db.executeRawSql`），不再直接使用旧 `wa-sqlite` 读写
- 兼容迁移：保留 `migrateFromIndexedDB()`，可将旧 `WA_SQLITE`（IndexedDB）数据迁移到主进程 SQLite（`migration.migrateFromRenderer`）

### 3.1 启动链路（代码确认）

- 主进程入口：`apps/desktop/layer/main/src/bootstrap.ts` -> `BootstrapManager.start()`
- 启动时会先执行 `DBManager.init()`（初始化/迁移主进程 SQLite）
- 常用命令：
  - 开发启动：`pnpm --filter Folo dev:electron`
  - 预览启动：`pnpm --filter Folo start`

### 4) 订阅与条目链路（当前实现）

- 订阅侧栏读取：
  - `subscriptionSyncService.fetch()` 直接读本地 Zustand + 本地 feed store（非远端拉取）
- 新增订阅：
  - 优先 `window.electron.ipcRenderer.invoke("db.addFeed", form)`，主进程用 Node `http/https` + 轻量 XML 解析抓取并写本地 `feeds/subscriptions/entries`
  - 非 Electron fallback 才走 `/api/rss-proxy`
- 条目列表/详情：
  - `entrySyncServices.fetchEntries()`、`fetchEntryDetail()` 已本地化

### 5) 仍残留的远端调用（必须继续清理）

- `api().entries.stream`（`/entries/stream`）：用于“缺失 content 的条目正文补全”
  - 触发点：`useEntriesByView` 中无条件调用 `useFetchEntryContentByStream(remoteQuery.entriesIds)`
- `api().entries.readability`
- `api().entries.readHistories`
- `api().entries.inbox.delete`
- 订阅模块仍有：
  - `api().subscriptions.update`
  - `api().subscriptions.batchUpdate`
  - `api().categories.*`（分类操作路径）
- 其他模块仍有大量 `api()/followClient.api` 调用（如 `feed/list/collection/inbox/action/translation/summary/discover/rsshub/wallet/messaging/trending`）
  - 说明：当前“本地化已完成”主要集中在订阅与阅读主链路，非核心模块仍默认在线

## 运行时观测（本机）

- 观测到 `~/Library/Application Support/Folo/IndexedDB/...` 存在历史数据
- 当前该路径下未发现 `folo_local.db`（说明该用户数据目录下主库未落盘或尚未走到对应初始化/路径）
- 结论：**代码目标是单库 SQLite，但本机仍可能处于“旧 IndexedDB 数据 + 新链路并存/迁移中”状态**

## 关键实现修正（与上一版差异）

- `db.addFeed` 当前实现不是 `rss-parser`，而是：
  - Node 内置 `http/https` 抓取 RSS（支持重定向）
  - 主进程内的轻量 XML 解析（RSS/Atom）
  - 默认最多写入 50 条最新 entries
- 订阅成功后会把返回的 `entries` 立即注入 renderer 内存态（避免订阅后列表空白）

## 模块定位（Desktop）

- 订阅流：`apps/desktop/layer/renderer/src/modules/subscription-column`
- 阅读列表：`apps/desktop/layer/renderer/src/modules/entry-column`
- 详情阅读器：`apps/desktop/layer/renderer/src/modules/entry-content`
- 发现与订阅：`apps/desktop/layer/renderer/src/modules/discover`
- 状态与持久化：`packages/internal/store/src`、`packages/internal/database/src`
- 主进程数据库与 IPC：`apps/desktop/layer/main/src/manager/db.ts`、`apps/desktop/layer/main/src/ipc/services/db.ts`

## 执行优先级

1. 彻底去除 `followClient/api()` 在阅读主链路中的依赖（先清 `/entries/stream`）
2. 收敛为单一数据面（`folo_local.db`）并验证迁移闭环
3. 清理剩余在线能力入口与文案

## 约束

- 任何上下文同步请求：先改本文件，再同步指针文件
- 目标冲突时，以“完全本地 RSS 可用性”优先
