# AI-CONTEXT.md

> 单一事实源（Single Source of Truth）
> 最后更新时间：2026-02-28（基于当前代码与 issue 修复进展）

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
- RSSHub 资源构建：`pnpm --filter FreeFolo build:rsshub`
- RSSHub 模式切换：设置 -> 数据控制 -> 内置 RSSHub -> `Lite/Official`
- 桌面打包已强制 `asar` 解包所有 `*.node`，并在拷贝保留模块时启用符号链接解引用（`dereference`），用于确保 `better-sqlite3` 原生二进制被正确带入安装包
- 桌面打包在 `postPackage` 阶段会再次覆盖产物内 `better_sqlite3.node`（以构建机当前二进制为准），降低跨机器启动失败概率
- `build:electron/build:electron:unsigned/build:electron-vite` 已前置执行 `build:rsshub`，自动生成 `apps/desktop/resources/rsshub/routes-manifest.json`
- 无签名打包产物目录：`/tmp/folo-forge-out/make`（常见产物：`FreeFolo-<version>-macos-arm64.dmg`）

### 5) Release 规则（Desktop）

- 当前仓库已移除 GitHub Actions 自动构建/发布 workflow（`.github/workflows` 为空）
- 发布与安装验证以本地构建流程为准：`pnpm --filter FreeFolo build:electron:unsigned`
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

## 内嵌 RSSHub 状态（当前）

### 1) 已完成

- 主进程 `RsshubManager`：状态机、健康检查、退避、cooldown、手动重启
- 端口策略：优先固定 `127.0.0.1:12000`，若端口占用则自动回退随机可用端口
- 启动策略：默认 `spawn + ELECTRON_RUN_AS_NODE=1`，可用环境变量切回 `fork`
- 路径解析：优先 `app.isPackaged/getAppPath`，不依赖单一 `ELECTRON_IS_PACKAGED`
- 运行时入口脚本（`resources/rsshub/*.js`）已改为 Node 内置路径解析，避免打包环境出现 `pathe` 依赖缺失导致子进程启动失败
- 运行模式：支持 `lite/official` 双模式，切换后自动重启内置 RSSHub
  - `lite`：轻量内置（白名单/内置路由）
  - `official`：官方 RSSHub 全量模式（本地内嵌官方运行时）
- 设置页（数据控制）会展示 Lite 模式支持路由清单（来自 `routes-manifest.json` 的 whitelist 路由），用于告知能力边界
- 头像菜单 `RSSHub` 子页面已改为“本地 RSSHub 控制台”，用于统一管理内置 RSSHub（启动/重启、模式切换、Lite 路由清单、自定义实例）
- 设置页“内置 RSSHub”已简化为状态摘要 + 跳转按钮，避免双入口配置分裂
- 打包资源：`apps/desktop/resources/rsshub` 已进入 `extraResource`
- 运行时安全：当前本地模式已关闭 token 鉴权限制（`runtime-auth` 恒放行），控制台地址不再附带 token 参数
- 错误透传：`RSSHUB_*` 从主进程透传到渲染层，前端可映射友好文案
- 自定义实例：设置页可配置 `rsshubCustomUrl`，命中该域名走直连，不拉起本地实例
- 运行时能力：
  - `/healthz`
  - `/status`（缓存占用诊断）
  - `/rsshub/routes/:lang?`（内置路由清单 RSS）
  - `/github/release/:owner/:repo`（302 -> GitHub releases atom）
  - `/github/commit/:owner/:repo`（302 -> GitHub commits atom）
- 构建清单：`routes-manifest.json` 已升级为 `embedded-dual`，包含 Lite 模式的 Top 路由白名单
- 官方运行时依赖：`build:rsshub` 会在 `apps/desktop/resources/rsshub/official-runtime` 下准备 `rsshub@1.0.0-master.5ddd208` 及依赖（体积较大）
- 缓存治理：运行时启动会执行缓存目录上限清理（默认 500MB，按文件 mtime LRU 删除）
- 状态页冷却倒计时已增加秒级 UI tick，`cooldown` 状态下可实时刷新剩余秒数

### 2) 当前边界

- `Lite` 模式为轻量内置路由，未内置路由返回：`RSSHUB_ROUTE_NOT_WHITELISTED`
- Lite 模式不提供运行时白名单编辑器（避免“可配置但不可执行”的误导）；以“可见路由清单”作为能力说明
- `Official` 模式走官方运行时全量执行链路；当上游路由不存在时返回：`RSSHUB_ROUTE_NOT_IMPLEMENTED`
- `Official` 模式执行异常时返回：`RSSHUB_OFFICIAL_RUNTIME_ERROR: <message>`
- `/api/radar/rules` 当前返回 RSS/XML（非 JSON rules 列表）；依赖 Radar JSON 规则的外部服务需做兼容转换
- 跨平台（Windows/Linux）完整验收仍需在目标环境实测

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
