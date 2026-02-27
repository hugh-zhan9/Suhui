# AI-CONTEXT.md

> 单一事实源（Single Source of Truth）
> 最后更新时间：2026-02-26（基于当前代码与 issue 修复进展）

## 上下文委派策略

本仓库所有 AI 规则统一维护在 `AI-CONTEXT.md`。  
`AGENTS.md`、`GEMINI.md`、`CLAUDE.md` 仅作为指针文件，不维护独立规则。

## 当前仓库真实状态（代码层）

### 1) 端与工作区

- 当前仅保留 Desktop：`apps/desktop`
- 已移除：`apps/mobile`、`apps/ssr`
- `pnpm-workspace.yaml` 为 desktop + packages

### 2) 产品目标

- 目标：**Desktop 端完全本地 RSS 阅读器（FreeFolo）**
- 已明确剔除：会员/计费、登录强依赖、在线 AI 主链路依赖

### 3) 本地数据面

- 主数据面：主进程 SQLite（`better-sqlite3`）
  - DB 文件：`app.getPath("userData")/folo_local.db`
  - 入口：`apps/desktop/layer/main/src/manager/db.ts`
  - 初始化：`apps/desktop/layer/main/src/manager/bootstrap.ts`
- 渲染层 DB：`packages/internal/database/src/db.desktop.ts`
  - 已改为 IPC SQL 代理（`db.executeRawSql`）
- 兼容迁移：保留 `migrateFromIndexedDB()`，用于历史 IndexedDB -> SQLite

### 4) 启动与构建（当前可用）

- 开发启动：`pnpm --filter FreeFolo dev:electron`
- 预览启动：`pnpm --filter FreeFolo start`
- 打包：`pnpm --filter FreeFolo build:electron`  
  无签名打包：`pnpm --filter FreeFolo build:electron:unsigned`

### 5) Release 规则（Desktop）

- 发布触发提交信息必须匹配：`release(desktop): Release <版本号>`
- 版本号支持两种格式：
  - `FreeFolo-vX.Y.Z`（推荐）
  - `vX.Y.Z`（兼容）
- 当前推荐发布版本格式：`FreeFolo-v0.0.1`（示例）
- `tag.yml` 会基于提交信息解析版本并创建标签：`desktop/<版本号>`
- `tag.yml` 不再创建 `desktop-build/v*` 递增构建标签，仓库仅保留 release 版本标签
- `build-desktop.yml` 在 `workflow_dispatch` 场景支持 `release_version` 输入，优先用于 Release 的 `name/tag`
- Release 附件匹配产物前缀为：`FreeFolo-*`（不再使用 `Folo-*`）
- `build-desktop.yml` 中 `.pkg/.appx` 上传仅在 `store=true` 时启用，避免普通构建产生“文件不存在”告警
- `Create Release Draft` 仅在 `macOS` runner 执行，避免多平台并发写同一 release 导致 finalize 失败
- release 上传清单已收敛为 macOS 实际产物（`.dmg/.zip/.yml`）
- 发布流程已移除 `npx changelogithub` 步骤，避免 git diff 过大导致 `ENOBUFS` 干扰发布
- `Setup Version`、`Prepare Release Notes`、`Prepare Release Meta` 仅在 `macOS` 执行，减少非发布平台无效步骤
- Release Note 由 `.github/scripts/generate-release-notes.mjs` 自动生成中文内容，不再从 `apps/desktop/changelog/*.md` 读取
- Release Note 固定不包含 `Thanks` 与 `Contributors` 区块

## 本地 RSS 主链路（已落地）

### 1) 订阅

- 新增订阅优先走 IPC：`db.addFeed`
- 主进程抓取：Node `http/https`（支持重定向）
- 解析：本地 XML 解析（不依赖 `linkedom/canvas`）
- 去重：feed URL + 站点 host 双重判定
- 入库：`feeds/subscriptions/entries`（本地）

### 2) 条目读取与刷新

- 列表/详情：`entrySyncServices.fetchEntries/fetchEntryDetail` 本地化
- 刷新：`db.refreshFeed` 本地拉取并写库
- 刷新去重：稳定条目 ID（`feedId + guid/url/title+publishedAt`）
- 刷新保留读状态：同身份条目继承既有 `read`

### 3) 已读/未读

- 已读事件统一：点击/滚动/激活统一走 `markRead(entryId)`
- 订阅右键动作双态：
  - 有未读 -> 全部已读
  - 全已读 -> 全部未读
- 批量读状态后会失效 `queryKey=["entries"]`，保证 `仅显示未读` 立即刷新

### 4) 未读计数口径

- `All/Articles` 未读数按“当前有效订阅来源”聚合统计
- 不再直接依赖 `entryIdByView[All]`，避免陈旧来源导致虚高

## 最近关键修复（issue 27-34）

- Tab 切换空列表：清空路由残留 + 归一化 pending feedId
- 新增订阅后重复（9 -> 18）：多层去重（参数/查询结果/最终 IDs）
- 刷新后读状态回退：刷新链路保留 `read`
- All 样式与 Articles 对齐
- 标题未读数与 Tab 未读数口径统一
- 右键“全部已读/全部未读”双态动作
- 批量改读状态后 `unreadOnly` 列表自动刷新
- All 未读虚高修复（按有效来源聚合）
- 移除设置中无关的“列表”菜单及其相关模块（发行前精简）

## 已知边界与残留在线能力

- 当前主阅读链路已本地化，但仓库仍存在部分在线接口分支（非主链路）：
  - `api().entries.readability`
  - `api().entries.inbox.delete`
  - 其他模块（如 translation/summary/discover 等）仍可能含远端调用
- 第 22 条（TTS 本地化）目前仍为“评估完成、暂不实现”状态

## 模块定位（Desktop）

- 订阅流：`apps/desktop/layer/renderer/src/modules/subscription-column`
- 阅读列表：`apps/desktop/layer/renderer/src/modules/entry-column`
- 详情阅读：`apps/desktop/layer/renderer/src/modules/entry-content`
- 发现与订阅：`apps/desktop/layer/renderer/src/modules/discover`
- 本地 store：`packages/internal/store/src`
- 主进程 DB/IPC：`apps/desktop/layer/main/src/ipc/services/db.ts`

## 执行优先级（当前）

1. 保持“完全本地 RSS 可用性”稳定（订阅、刷新、阅读、已读计数）
2. 继续收敛残留在线能力入口（按业务优先级逐步本地化）
3. 如需 TTS，优先系统离线方案（第 22 条）

## 约束

- 任何上下文同步请求：先改本文件，再同步指针文件
- 若与其他文档冲突，以本文件为准
