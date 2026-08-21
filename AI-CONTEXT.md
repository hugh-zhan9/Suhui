# AI-CONTEXT.md

> 单一事实源（Single Source of Truth）
> 最后更新时间：2026-08-21（SQLite 支持与 Postgres ↔ SQLite 双向转换；渲染层远端接口清零；错误 toast 可复制）

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

- 主数据面：主进程**双方言** Postgres / SQLite（`pg` / `better-sqlite3` + Drizzle）
  - 入口：`apps/desktop/layer/main/src/manager/db.ts`
  - 初始化：`apps/desktop/layer/main/src/manager/bootstrap.ts`
  - 方言解析：`manager/db-config.ts` 的 `resolveDbType`——`DB_TYPE` 显式优先，
    否则**只要存在 `DB_CONN` 就按 Postgres**（既有安装不被静默切库），全新安装默认 SQLite
  - SQLite 默认库文件：`app.getPath("userData")/suhui.db`
- **表对象随方言重绑**（关键约束）：`packages/internal/database/src/schemas/index.ts`
  用 `export let` + `onRuntimeDbTypeChange` 实时绑定切换 27 张表。
  drizzle 的值编解码（boolean ↔ 0/1、JSON ↔ 文本）挂在**列对象**上，
  拿 Postgres 的表去查 SQLite 会报
  `SQLite3 can only bind numbers, strings, bigints, buffers, and null`。
  唯一切换点是 `setRuntimeDbType`；主进程在 `runInit` 首个 await 前设定，渲染层在
  `db.desktop.ts` 解析方言后设定。**不要用 Proxy 转发**——drizzle 的 `is()` 判定会失败并无限递归
- 迁移：Postgres 用 `db.main.ts` 内硬编码 DDL 数组；SQLite 用
  `src/drizzle/sqlite-baseline.ts`（由 `scripts/generate-sqlite-baseline.mjs` 从单一基线编译，
  打包后 `.sql` 不可读）＋ `__suhui_migrations` 账本保证幂等
- `schemas/sqlite.ts` 由 `scripts/generate-sqlite-schema.mjs` 从 `postgres.ts` 机械生成，
  不要手改；两套 schema 逐列产出相同 JS 类型（`dialect-type-parity.test-d.ts` 钉住）
- 双向转换：`application/db-conversion/service.ts`，走 `.suhui-backup` 格式
  （导出 → 切库 → replace 恢复），非破坏性，源库始终保留；
  UI 在 设置 → 数据 → 数据库，转换期间该区块阻塞
- 原生模块：只有 `better-sqlite3` 惰性 `createRequire`；**drizzle 的 sqlite 驱动必须静态导入**
  （打包后 asar 里没有 `node_modules/drizzle-orm`）
- 渲染层 DB：`packages/internal/database/src/db.desktop.ts`
  - IPC SQL 代理（`db.executeRawSql`），按 `db.getDialect()` 选 `sqlite-proxy` 或 `pg-proxy`
- 兼容迁移：保留 `migrateFromIndexedDB()`，用于历史 IndexedDB -> 主库

### 4) 启动与构建（当前可用）

- 开发启动：`pnpm --filter suhui dev:electron`
- 预览启动：`pnpm --filter suhui start`
- 打包：`pnpm --filter suhui build:electron`  
  无签名打包：`pnpm --filter suhui build:electron:unsigned`
- 无签名产物根目录：`/tmp/suhui-forge-out`  
  定义在 `apps/desktop/scripts/forge-ignore.ts` 的 `unsignedForgeOutputRoot`，仅在 `FOLO_NO_SIGN=1` 时作为 forge `outDir` 生效
  - `make` 流程产物：`/tmp/suhui-forge-out/make`（darwin makers 为 `MakerZIP` + `MakerDMG`）
  - `package` 流程产物：`/tmp/suhui-forge-out/溯洄-darwin-<arch>/溯洄.app`

#### 本机安装（macOS，日常验证用这个）

- 一条命令：`pnpm install:macos-local`（等价于 `bash scripts/install-macos-local.sh`）
- 脚本按序执行，任一步失败会打印 `step:` 与产物诊断：
  1. 退出正在运行的 `溯洄`（AppleScript quit -> TERM -> 15s 后 `kill -9`）
  2. `pnpm --filter suhui build:electron-vite`
  3. `FOLO_NO_SIGN=1` 下跑 forge `package`（只 package，不出 DMG）
  4. `ditto` 到临时路径 -> `codesign --force --deep --sign -` -> `xattr -dr com.apple.quarantine`
  5. 原子替换 `/Applications/溯洄.app`；替换失败会把旧 bundle 移回原位
  6. 构建 `@suhui/cli` 并把 `suhui` 软链到 `~/.local/bin`
  7. `open` 新安装的 app
- 可用环境变量：
  - `SUHUI_INSTALL_ARCH`：`arm64` / `x64`，默认取 `uname -m`
  - `SUHUI_CLI_BIN_DIR`：CLI 软链目录，默认 `~/.local/bin`
- macOS 上的 Ad-hoc 签名已自动化，不需要手动补签：
  - forge `postPackage` 钩子在 `platform === "darwin" && FOLO_NO_SIGN=1` 时签名产物（`apps/desktop/scripts/packaging/adhoc-sign.ts`）
  - `install-macos-local.sh` 在 `ditto` 之后再签一次，确保安装到 `/Applications` 的 bundle 自身有效

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
- 发布与安装验证以本地构建流程为准：
  - 出安装包：`pnpm --filter suhui build:electron:unsigned`
  - 装到本机验证：`pnpm install:macos-local`
- 历史 CI 发布规则与 release 编排保留在 `docs/AI_CHANGELOG.md` 作为演进记录，不再作为当前执行基线

## 本地 RSS 主链路（已落地）

### 1) 订阅

- 新增订阅优先走 IPC：`db.addFeed`
- 主进程抓取：Electron `session.defaultSession.fetch`（`ipc/services/feed-fetch.ts`，手动跟随重定向）
- 解析：本地 XML 解析（`rss-parser.ts` 保持零依赖，不引入 `linkedom`）
- 去重：feed URL + 站点 host 双重判定
- 入库：`feeds/subscriptions/entries`（本地）

#### 网页地址订阅（自动发现 + 页面生成）

- 入口不变：仍是 `db.previewFeed` / `db.addFeed`，用户可直接填网页地址
- 判定顺序在 `ipc/services/feed-source-resolver.ts`：
  1. 先按订阅源文档解析；成功即 `source=direct`，存库地址保持用户输入（`rsshub://` 因此不会被写成实例地址）
  2. 解析失败且响应是 HTML 时做自动发现（`feed-discovery.ts`）：`link rel=alternate` -> 平台硬规则 -> 页面内订阅链接 -> generator 默认路径 -> 通用路径兜底；候选必须真实抓取并解析出条目才算命中，命中后存库地址改为发现到的订阅源地址
  3. 仍无订阅源时按文章列表抓取页面（`site-scrape.ts`），存库地址为 `sitescrape:<页面地址>`
  4. 以上都不成立时抛 `FEED_DISCOVERY_FAILED`，renderer 映射为「该网页没有可用的订阅源」

#### 陈旧订阅源与订阅前选择

- 发现到订阅源后会用同一份已抓取的 HTML 做一次陈旧判定（`feed-staleness.ts`，不额外发请求）
- 判定为陈旧需同时满足：页面最新文章比订阅源最新条目新 30 天以上，且页面最近 3 篇都不在订阅源里（按路径比对，忽略 host 与 query，兼容换域名与 `?utm_source=rss`）
- 陈旧且页面可抓取时，默认来源改为页面抓取，并把停更的订阅源作为备选项放进 `sourceOptions`
- `previewFeed` 返回 `sourceOptions = { active, alternatives, staleLagDays? }`；`alternatives` 非空时 `FeedSourcePicker` 才出现，用户可在订阅前切换
- 切换的实现是重新预览另一个地址；`followMutation` 始终提交 `feed.url`，因此预览与落库不会不一致

#### 边界与约束

- 候选探测有上限：最多 8 个候选、每个 8s 超时、最多 3 次跳转，整个探测阶段另有 20s 总预算（`DISCOVERY_BUDGET_MS`）
- 候选地址必须是公网地址，或与页面同 host；页面不得把主进程请求指向 loopback / 内网 / 链路本地地址（`isPrivateNetworkHost`）
- 发现与抓取只用于订阅流程。刷新既有订阅时 `allowDiscovery: false`，订阅源地址开始返回网页时必须继续报错，不得改用网页内容
- 输入被改写过的地址（`rsshub://` 解析成实例地址）不做发现，避免把实例地址或 `sitescrape:` 落库
- 发现与抓取以 `fetchResult.finalUrl` 为基准，相对链接和抓取目标都按跳转后的地址解析
- HTML 解析统一用 canvas-free 的 `linkedom/worker`（与 OPML、readability 一致），由 `feed-discovery-no-canvas.test.ts` 约束
- 页面抓取是全自动的，但设有置信度门槛（条目数、日期覆盖率、路径一致性、标题质量）；不达标时明确失败，不把导航链接当文章入库
- 被同一组多个链接共用的容器不提供日期与摘要：列表容器上的单个日期不得分给整组链接
- 日期只接受明确到某一天的写法；`2026`、`2026-05`、`1.2.2026` 一律拒绝。纯日期统一归一到 UTC 零点，带时间的时间戳保留原始偏移
- 抓取不给缺失发布时间兜底，`publishedAt` 缺失即为 0，与「不使用 `Date.now()` 伪装最新发布」口径一致
- `sitescrape:` 源刷新时重新抓取页面；去重键按抓取目标归一（`rss-dedup.ts`），不与站点真实订阅源冲突
- `sitescrape:` 源只有本应用能消费，导出 OPML 后其他阅读器无法订阅

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
- 无签名构建后增加 Ad-hoc 自签名步骤，修复 macOS 26（M5）上 `SIGKILL (Code Signature Invalid)` 崩溃（现已自动化，见「本机安装」）
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

## 最近补充修复（2026-04-03）

- 本地批量刷新链路已补齐 renderer 同步：
  - 手动全局刷新会把刷新成功的 feed 条目同步回本地 store
  - 自动刷新完成后会广播成功 feed 列表，renderer 侧按需回拉条目，避免 UI 长时间停留在旧数据
- 已新增批量刷新审计日志：
  - `refresh.log` 写入 `app.getPath("logs")`
  - 当前覆盖 `manual-batch`、`startup-auto`、`interval-auto`
  - 当前记录 `batch.start`、`batch.no_subscriptions`、`batch.feed_failed`、`batch.completed`、`runner.skipped`、`runner.failed`
- 已补充排查文档：
  - `docs/local-refresh-observability.md`

## 最近补充修复（2026-08-19）

- 添加订阅预览失败提示已改为用户可读口径：
  - 新增 `apps/desktop/layer/renderer/src/lib/feed-preview-error.ts`，识别 `本地预览订阅失败 -> db.previewFeed -> HTTP/网络/解析` 这条错误链并翻译成原因 + 下一步动作
  - 覆盖 404/410、401/403、429、5xx、其他 4xx、DNS、连接、超时、证书、跳转异常、非订阅源内容
  - `FeedForm` 错误态改为「原因标题 + 处理建议 + 弱化的原始技术细节（含实际请求地址）」，不再把 IPC 方法名当作主要提示
  - 未命中该链路的错误保持原样透传，RSSHub 专用提示仍优先生效

## 远端接口：已清零（2026-08-21）

`api()` 与 `followClient.api` 都指向 `https://api.suhui.io`，没有服务在跑，
所以任何残留调用都是必然失败的死路。现已全部清除，并由
`apps/desktop/layer/renderer/src/lib/no-remote-api.test.ts` 三条零容忍约束守住：

1. 任何 store 模块不得出现 `api().`
2. 渲染层除 `lib/api-client.ts` 自身外不得出现 `followClient.api`
3. 渲染层只能通过 `~/lib/toast` 使用 toast（否则错误 toast 丢掉复制按钮）

处理原则：本地能忠实实现的就本地化，本质是云服务的就连 UI 一起删。

- 本地化：订阅源刷新（`db.refreshFeed`）、OPML 解析与导入
  （`localReading.previewOpml`/`importOpml`）、列表增删改（本地 `lists` 表）、
  收件箱改名、用户订阅与列表（本地 store，本地只有一个用户）
- 明确报错：discover 关键词搜索——本地没有全网索引，提示改为「粘贴网页/订阅源地址或 rsshub:// 路由」
- 已删除：Power 钱包经济与 `/power` 页面、云端 action 自动化与 `/action` 页面
  （本地规则引擎在 设置 → 阅读工作流，提供 markRead/star/队列/tags/hide）、
  认领订阅源、云端 RSSHub 实例市场、`useResetFeed`
- 保留：`lib/api-client.ts`（登录会话仍需其类型与拦截器）、
  `modules/rsshub/LocalRsshubConsole` 与 `external-config-modal`（外部 RSSHub 配置）
- 第 22 条（TTS 本地化）目前仍为“评估完成、暂不实现”状态

## 错误提示可复制（2026-08-21）

`styles/base.css` 的 `body, #root { select-none }` 会让所有报错都选不中。

- toast 的 title/description/容器单独放开 `select-text`
- `apps/desktop/layer/renderer/src/lib/toast.ts` 是唯一 toast 入口：
  错误 toast 自动挂「复制」按钮、停留 10 秒；调用方自带 `action` 时不抢占，
  message 是 React 节点（拿不到纯文本）时不硬加
- 报错文案约定：标题给结论，`description` 放可复制的原文

## 远程访问当前边界

- 当前远程能力优先级已经调整为“阅读体验优先于后台管理能力”
- 已完成的主价值链路：
  - 远程阅读
  - 已读/未读切换
  - feed 刷新
  - 轻量订阅管理
  - 本地 OPML 预览、选择性导入与导出
  - 规则、文章标签/隐藏、笔记/高亮、重复来源与稍后读的共享应用服务和核心操作
- 当前未优先推进的能力：
  - 完整设置页
  - 批量订阅操作
  - 分类级管理
- 完整备份包含正文、笔记和本地设置，在 Remote 尚无鉴权时只允许 Desktop 文件选择器调用；Remote 不暴露备份下载或恢复接口
- 备份同时携带 renderer 的 `follow:general` 与 `follow:ui` 设置；可能包含凭据的 `follow:ai`、`follow:integration` 明确排除并记录在 manifest
- Remote 尚无鉴权时，规则、标签、隐藏、聚类人工决策、笔记、高亮和阅读队列 HTTP 路由仅允许 loopback peer；LAN/VPN Remote 不暴露这些私密读取和写操作
- 内容误聚类可持久拆分；拆分排除记录属于用户决定，参与备份且聚类重建不得覆盖
- 远程事件流断开时，前端必须显式显示连接断开，不得伪装为在线写入成功

## 本地阅读工作流（2026-08-12）

- `.suhui-backup` v1 使用流式 NDJSON、记录计数与 SHA-256 校验；支持 merge 与带安全快照、二次确认、事务回滚的 replace
- 恢复设置通过 Postgres 持久日志在 main/renderer 启动时补投影；replace 进入维护屏障，拒绝新本地阅读写入并等待已运行任务退出
- OPML 2.0 导入/导出完全本地执行，支持预览、选择订阅与分类保留
- 重复文章只聚类折叠，不删除原文或共享逐篇状态；代表项顺序为人工指定、用户投入、正文完整度、最早发布时间
- 历史聚类按 200 条分页并持久化 cursor/batch checkpoint；重建、自动聚类、人工代表与拆分共用串行操作边界，失败或重启不会覆盖用户决定
- 规则默认只处理新入库文章；历史应用必须预览确认，动作支持已读、收藏、稍后读、文章标签与隐藏
- 笔记、高亮、文章标签和稍后读都绑定具体 `entryId`；高亮可重定位并保留 orphan 状态
- 稍后读与已读、收藏独立，显式完成保留完成时间和统计
- 完整备份包含已应用同步操作的幂等账本；完整替换清除 pending 队列并恢复该账本，避免旧 pending 或历史操作在恢复后重复改写数据

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

后续产品迭代方向见：`docs/iteration-direction.md`（2026-07-30 起为现行方向）。

1. 保持“完全本地 RSS 可用性”稳定（订阅、刷新、阅读、已读计数）
2. 稳定并扩展远程浏览器访问的日常可用性（阅读优先，逐步补齐设置/导入导出/批量与分类管理）
3. 继续收敛残留在线能力入口（按业务优先级逐步本地化；正文 readability 优先本地化）
4. 如需 TTS，优先系统离线方案（第 22 条）
5. 近期待办优先序：坏源/刷新可视化与正文全文索引深化 → 本地全文缓存 + 远程最小鉴权
6. 不优先：Redis/换库换栈、会员登录与在线 AI 主链路、Remote 完整第二套 Desktop、内嵌 RSSHub 运行时

## 约束

- 任何上下文同步请求：先改本文件，再同步指针文件
- 若与其他文档冲突，以本文件为准
