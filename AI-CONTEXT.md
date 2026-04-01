# AI-CONTEXT.md

> 单一事实源（Single Source of Truth）
> 最后更新时间：2026-04-01（基于当前代码、远程访问实现、排序修复与文档同步结果）

## 上下文委派策略

本仓库所有 AI 规则统一维护在 `AI-CONTEXT.md`。  
`AGENTS.md`、`GEMINI.md`、`CLAUDE.md` 仅作为指针文件，不维护独立规则。

## 当前仓库真实状态（代码层）

### 1) 端与工作区

- 当前仅保留 Desktop：`apps/desktop`
- 已移除：`apps/mobile`、`apps/ssr`
- `pnpm-workspace.yaml` 为 desktop + packages

### 2) 产品目标

- 目标：**Desktop 端完全本地 RSS 阅读器（溯洄 / Suhui）**
- 当前已扩展：运行中的 Desktop app 可对外托管远程浏览器访问入口（LAN / VPN 内 `IP + 端口`）
- 已明确剔除：会员/计费、登录强依赖、在线 AI 主链路依赖

### 3) 本地数据面

- 主数据面：主进程 Postgres（`pg` / Drizzle）
  - 入口：`apps/desktop/layer/main/src/manager/db.ts`
  - 初始化：`apps/desktop/layer/main/src/manager/bootstrap.ts`
- 渲染层 DB：`packages/internal/database/src/db.desktop.ts`
  - 已改为 IPC SQL 代理（`db.executeRawSql`）
- 兼容迁移：保留 `migrateFromIndexedDB()`，用于历史 IndexedDB -> Postgres

### 4) 启动与构建（当前可用）

- 开发启动：`pnpm --filter suhui dev:electron`
- 预览启动：`pnpm --filter suhui start`
- 打包：`pnpm --filter suhui build:electron`  
  无签名打包：`pnpm --filter suhui build:electron:unsigned`
- 无签名打包产物目录：`/tmp/folo-forge-out/make`（常见产物：`溯洄-<version>-macos-arm64.dmg`）

### 5) 远程浏览器访问（当前已落地）

- 形态：不是独立 web 产品，而是 Electron main 内嵌 remote HTTP server + renderer remote entry
- 访问方式：运行中的 app 通过 `IP + 端口` 对 LAN / VPN 暴露浏览器访问入口
- 单一真相源：
  - 持久化真相：本地 Postgres
  - 写入协调者：Electron main process
  - 桌面端与远程浏览器端都是客户端，不允许远程端直接写库
- 当前主进程 remote 能力：
  - 健康与状态：`/health`、`/status`
  - 事件流：`/events`（SSE）
  - 订阅：`GET/POST/PATCH/DELETE /api/subscriptions`
  - 条目：`GET /api/entries`、`GET /api/entries/:id`
  - 未读：`GET /api/unread`
  - 读状态：`POST /api/entries/read`（支持 `read=true/false`）
  - 刷新：`POST /api/feeds/:feedId/refresh`、`POST /api/feeds/refresh-all`
- 当前远程浏览器端能力：
  - 订阅列表与未读数
  - 条目列表与详情阅读
  - `Unread only`
  - `Mark read / Mark unread`
  - `Prev / Next`
  - 读完自动前进
  - 作者、原文链接、时间等基础元信息展示
  - 列表排序：`Newest / Oldest / Unread First`
  - 订阅新增、删除、编辑（`title / category / view`）
  - 断线提示、重试同步、最近同步时间、当前阅读上下文显示
- 当前边界：
  - 远程端已适合“阅读 + 轻量订阅管理”
  - 设置页、导入导出、批量管理与更多 Electron 专属能力映射仍未完成
  - 远程端仍是独立轻量实现，不是桌面 renderer 的完全等价复用层

### 6) Release 规则（Desktop）

- 当前仓库已移除 GitHub Actions 自动构建/发布 workflow（`.github/workflows` 为空）
- 发布与安装验证以本地构建流程为准：`pnpm --filter suhui build:electron:unsigned`
- 历史 CI 发布规则与 release 编排保留在 `docs/AI_CHANGELOG.md` 作为演进记录，不再作为当前执行基线

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

## 外部 RSSHub 模式（当前）

### 1) 已完成

- 已移除内嵌 RSSHub 运行时与 Lite/Official 模式
- `rsshub://` 与 `https://rsshub.app/...` 订阅统一改写为外部 RSSHub 实例地址
- 未配置外部 RSSHub 时抛 `RSSHUB_EXTERNAL_UNCONFIGURED`，前端弹出配置引导
- 可选择使用官方默认 `https://rsshub.app` 作为外部实例地址
- 设置页与 RSSHub 子页面统一为“外部 RSSHub 配置”

### 2) 当前边界

- 依赖外部 RSSHub 实例可用性；`rsshub.app` 公共实例可能限流/403
- 无内置运行时，不再提供 Lite 白名单/本地控制台/运行状态

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
- 无签名构建后增加 Ad-hoc 自签名步骤，修复 macOS 26（M5）上 `SIGKILL (Code Signature Invalid)` 崩溃
- 主进程已加入 renderer console 防回声过滤（忽略 `electron-log.js` 与重复 `[Renderer Error]` 消息），缓解日志风暴
- 内置 RSSHub 健康检查已改为短时轮询探测（默认 20 次 \* 250ms），避免子进程冷启动瞬时 `ECONNREFUSED` 造成误判启动失败

## 最近补充修复（issue 35-41）

- 添加订阅弹窗（`SimpleDiscoverModal`）仅保留 `RSS/RSSHub` 两类输入，已移除 `Search` 模式与 “Or go to Discover...” 引导文案
- 设置页已删除 `feeds/list/notifications` 三个页面入口，并增加本地隐藏规则，防止后续被重新暴露
- 设置页进一步精简：
  - 外观移除“隐藏徽章”开关
  - 通用移除 `TTS` 与“网络/代理”配置块
- 通用“标记已读”默认策略已切换为“单项内容进入视图时”（`render=true`、`scroll=false`），并对未改过设置的旧默认用户执行一次性迁移
- 头像菜单已移除“登出”入口
- 内置 RSSHub 在打包环境的路径识别已增强：当缺少 `electron app` 上下文和 `ELECTRON_IS_PACKAGED` 时，按路径特征兜底识别，避免误走开发路径导致启动失败
- Discover 首页趋势模块默认拉取数量已调整为 `50`（`DiscoveryContent -> Trending limit=50`）
- issue 第 39 条已按产品决策直接删除，不纳入修复范围

## 最近补充修复（2026-04-01）

- 远程浏览器端同步链路已补齐：
  - remote entry 注入 `queryClientContext`
  - 当前选中 feed 会真实拉取条目
  - `entries.updated` 失效后可重新取数
  - 订阅刷新改为全量替换，避免删除订阅后残留旧项
  - 远程详情在缓存仅含摘要时会补拉完整正文
- 订阅列表按未读排序时已去掉 onboarding 插队逻辑，当前应严格按未读数排序
- 文章发布时间写入已移除 `Date.now()` 兜底，避免缺失发布时间时伪装成“最新发布”
- 已新增 `apps/desktop/scripts/repair-published-at.ts`，用于在真实数据库环境下诊断和修复历史 `publishedAt` 脏数据
- 已新增文档：
  - `docs/README.md`
  - `apps/desktop/scripts/README.repair-published-at.md`

## 已知边界与残留在线能力

- 当前主阅读链路已本地化，但仓库仍存在部分在线接口分支（非主链路）：
  - `api().entries.readability`
  - `api().entries.inbox.delete`
  - 其他模块（如 translation/summary/discover 等）仍可能含远端调用
- 第 22 条（TTS 本地化）目前仍为“评估完成、暂不实现”状态

## 远程访问当前边界

- 当前远程能力优先级已经调整为“阅读体验优先于后台管理能力”
- 已完成的主价值链路：
  - 远程阅读
  - 已读/未读切换
  - feed 刷新
  - 轻量订阅管理
- 当前未优先推进的能力：
  - 设置页
  - 导入导出
  - 批量订阅操作
  - 分类级管理
- 远程事件流断开时，前端必须显式显示连接断开，不得伪装为在线写入成功

## 模块定位（Desktop）

- 订阅流：`apps/desktop/layer/renderer/src/modules/subscription-column`
- 阅读列表：`apps/desktop/layer/renderer/src/modules/entry-column`
- 详情阅读：`apps/desktop/layer/renderer/src/modules/entry-content`
- 发现与订阅：`apps/desktop/layer/renderer/src/modules/discover`
- 本地 store：`packages/internal/store/src`
- 主进程 DB/IPC：`apps/desktop/layer/main/src/ipc/services/db.ts`
- 主进程远程服务：`apps/desktop/layer/main/src/remote`
- 主进程共享应用服务：`apps/desktop/layer/main/src/application`
- 远程浏览器入口：`apps/desktop/layer/renderer/remote.html`
- 远程浏览器端：`apps/desktop/layer/renderer/src/remote`

## 执行优先级（当前）

1. 保持“完全本地 RSS 可用性”稳定（订阅、刷新、阅读、已读计数）
2. 稳定远程浏览器访问的阅读体验与轻量订阅管理能力
3. 继续收敛残留在线能力入口（按业务优先级逐步本地化）
4. 如需 TTS，优先系统离线方案（第 22 条）

## 约束

- 任何上下文同步请求：先改本文件，再同步指针文件
- 若与其他文档冲突，以本文件为准
