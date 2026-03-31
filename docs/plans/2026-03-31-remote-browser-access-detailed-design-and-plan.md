# Suhui 远程浏览器访问详细设计与开发计划

Date: 2026-03-31

Related spec:

- `docs/superpowers/specs/2026-03-31-remote-browser-access-design.md`

## 1. 文档目标

本文件是在已确认产品方案基础上的实施级设计与开发计划。目标不是重复高层 spec，而是明确：

- 当前代码基线与主要改造点
- 目标模块边界与职责
- 接口层、事件层、客户端层的拆分方式
- 分阶段开发顺序
- 每阶段交付物、测试项、风险点
- 推荐的第一个 implementation slice

本文档默认接受以下已确认前提：

- 远程访问通过局域网或 VPN 内的 `IP + 端口`
- 远程端与桌面端同权
- 不引入额外认证、访问码或远程专属确认机制
- 主进程为唯一写入口
- 远程事件流断开时必须显式提示连接断开

## 1.1 当前实现快照

截至 2026-03-31，本文档中的 Phase 1 已经有较大一部分落地，当前代码状态不是“纯计划”，而是“计划 + 已实现基线”。

当前已落地：

- main process 内嵌 remote HTTP server 与生命周期接入
- `/health`、`/status`、`/events`
- `/api/subscriptions`、`/api/unread`、`/api/entries`、`/api/entries/:id`
- `POST /api/entries/read`
- `POST /api/feeds/:feedId/refresh`
- `POST /api/feeds/refresh-all`
- `POST/PATCH/DELETE /api/subscriptions`
- renderer 多入口 remote browser entry
- 远程阅读主链路：
  - 订阅列表
  - 未读数
  - 条目列表
  - 详情阅读
  - 未读筛选
  - 已读/未读切换
  - 上一条/下一条
  - 自动前进
  - 作者/原文链接等基础元信息
  - 排序
  - 断线提示与重试同步
  - 阅读上下文条
- 轻量订阅管理：
  - 新增订阅
  - 删除订阅
  - 编辑 `title/category/view`

当前仍待推进：

- 设置页
- 导入导出
- 批量订阅管理
- 分类级管理
- 更深的 Electron 专属能力浏览器映射
- store capability 层的系统性收敛

## 2. 当前代码基线与改造约束

### 2.1 现状摘要

当前仓库是 `desktop-only` 架构，核心链路为：

- Electron main process
- renderer UI
- local Postgres
- IPC services

主进程已经拥有以下权威能力：

- DB 初始化与访问
- 本地订阅预览与订阅创建
- 本地 feed 刷新与批量刷新
- 设置、同步、集成等多种 IPC service

这意味着远程访问不能被实现为“浏览器直接访问 DB”或“重新做一套后端逻辑”。最佳路径是让主进程同时服务桌面端和远程端。

### 2.2 现有关键入口

以下文件是本次改造的核心锚点：

- `apps/desktop/layer/main/src/manager/bootstrap.ts`
  - 主进程生命周期、DB 初始化、窗口创建、周期任务启动点
- `apps/desktop/layer/main/src/ipc/index.ts`
  - IPC service 注册入口
- `apps/desktop/layer/main/src/ipc/services/*.ts`
  - 现有主进程能力暴露面
- `apps/desktop/layer/renderer/src/main.tsx`
  - renderer 启动入口
- `apps/desktop/layer/renderer/src/initialize/index.ts`
  - 初始化流程、数据 hydrate、设置初始化等
- `apps/desktop/layer/renderer/src/lib/client.ts`
  - IPC client 代理
- `packages/internal/store/src/*`
  - 客户端 store、hydrate、业务操作入口
- `packages/internal/database/src/*`
  - DB facade 与服务层

### 2.3 当前最重要的问题

远程访问的真正阻碍不是“缺一个 HTTP server”，而是当前客户端数据访问方式存在三层混合：

1. `packages/internal/store` 直接调用数据库服务
2. `packages/internal/store` 直接调用 `window.electron.ipcRenderer`
3. `packages/internal/store` 调用 `api()`

这种结构在桌面单端场景还可以运行，但在双客户端场景下会导致：

- 同一业务有不同写路径
- 浏览器端不得不保留 Electron 判断分支
- 新增 HTTP 接口后仍然会出现桌面逻辑和远程逻辑分叉

因此，远程访问的第一原则不是“先搭 server”，而是“先把业务能力下沉到共享服务层，并把客户端接入层统一出来”。

## 3. 目标架构

### 3.1 总体结构

目标结构如下：

```text
Application Services
├── IPC Adapter
├── HTTP Adapter
└── Event Broadcaster

Clients
├── Desktop Renderer
└── Remote Browser
```

### 3.2 设计原则

- 主进程是唯一写协调者
- 桌面端与远程端都是客户端
- IPC 和 HTTP 都只是 adapter，不承载业务真相
- 客户端不直接决定“写到哪”，只调用统一 capability
- 所有跨端同步都通过领域事件驱动

### 3.3 分层定义

#### Layer A: Application Services

作用：

- 承载所有核心读写业务能力
- 统一任务编排、并发控制、写入后事件发布

建议目录：

- `apps/desktop/layer/main/src/application/`

建议子域：

- `feeds`
- `subscriptions`
- `entries`
- `unread`
- `settings`
- `lists`
- `collections`
- `integration`
- `data-control`
- `sync`

每个子域至少包含：

- service
- types
- event names
- task coordinator（需要编排长任务时）

#### Layer B: IPC Adapter

作用：

- 保留现有 Electron renderer 接入方式
- 把现有 `ipc/services/*.ts` 逐步改成薄 adapter

原则：

- 仅做参数转换、错误映射、上下文注入
- 不保留复杂业务逻辑

#### Layer C: HTTP Adapter

作用：

- 为远程 browser client 暴露 REST API
- 提供状态查询与写操作入口

建议目录：

- `apps/desktop/layer/main/src/remote/http/`

建议内容：

- router registry
- request handlers
- error mapper
- JSON serializer

#### Layer D: Event Broadcaster

作用：

- 所有写操作成功后统一广播领域事件
- 支持桌面 renderer 与 remote browser 同步刷新

建议目录：

- `apps/desktop/layer/main/src/remote/events/`

#### Layer E: Remote Browser Client

作用：

- 在浏览器中运行的 Suhui remote app
- 复用现有 UI 层，但使用 remote capability provider

建议目录：

- `apps/desktop/layer/renderer/src/remote/`
  或
- `apps/desktop/layer/renderer/src/entrypoints/remote/`

这里不建议新建历史意义上的 `apps/web` 工作区，避免重新回到双产品结构。

## 4. 远程服务设计

### 4.1 进程与生命周期

远程服务由 Electron main process 托管。

挂载点建议：

- 在 `BootstrapManager.start()` 的 `app.whenReady()` 流程中初始化远程服务注册器
- 在主窗口创建之后启动 remote server manager
- 在 `before-quit` 中优雅关闭 HTTP server 与事件流连接

新增模块建议：

- `apps/desktop/layer/main/src/remote/server.ts`
- `apps/desktop/layer/main/src/remote/manager.ts`
- `apps/desktop/layer/main/src/remote/config.ts`

职责拆分：

- `RemoteServerManager`
  - start
  - stop
  - restart
  - reportStatus
- `RemoteHttpServer`
  - register routes
  - serve static assets
  - bind port
- `RemoteConnectionRegistry`
  - track SSE/WebSocket clients
  - broadcast events

### 4.2 传输协议

一期建议：

- HTTP JSON API
- SSE 事件流

原因：

- 浏览器原生支持好
- 服务端实现与调试成本低
- 目前主要需要 server -> client 推送，而不是复杂双向流

保留演进：

- 若后续远程控制需要更强的实时双向语义，可补 WebSocket，但不作为一期前置条件

### 4.3 静态资源分发

远程浏览器端需要由主进程远程服务直接托管静态资源。

建议方式：

- 在打包时生成 remote browser bundle
- 主进程通过内嵌 HTTP server 分发远程 bundle

构建策略建议：

- 继续复用现有 renderer 工程
- 增加单独 remote entry
- 不复活旧 `build:web` 作为产品入口

推荐产物方向：

- `apps/desktop/out/remote-web/`

### 4.4 状态页与诊断

尽管用户不要求额外安全限制，远程能力仍需要基本可观测性。

建议提供：

- server host
- server port
- startup status
- remote client count
- recent connection / disconnect events

这些信息应在桌面设置页中可见，便于定位问题。

## 5. 共享应用服务设计

### 5.1 抽离原则

从现有 `ipc/services/*.ts` 抽离共享应用服务时，要按“域能力”抽，不按“传输方式”抽。

错误示范：

- `DbHttpService`
- `IpcDbFacade`

推荐方式：

- `SubscriptionApplicationService`
- `EntryApplicationService`
- `RefreshApplicationService`
- `SettingsApplicationService`

### 5.2 优先抽离的域

优先级从高到低建议如下：

1. subscriptions
2. entries + unread
3. feed preview + refresh
4. settings
5. lists / collections
6. integration
7. data-control

原因：

- 这些域直接决定远程端是否“像真的 app”
- 且它们在现有 store 中存在明显的 Electron 分支与 API 分支混用

### 5.3 共享服务能力清单

最低应具备如下服务接口：

#### SubscriptionApplicationService

- createSubscription
- updateSubscription
- deleteSubscription
- listSubscriptions
- listCategories

#### EntryApplicationService

- listEntries
- getEntryDetail
- markRead
- markUnread
- batchMarkReadState

#### FeedPreviewApplicationService

- previewFeedByUrl
- previewFeedById

#### RefreshApplicationService

- refreshFeed
- refreshAllFeeds
- getRefreshTaskState

#### SettingsApplicationService

- getSettingsSnapshot
- updateSetting
- batchUpdateSettings

#### DataControlApplicationService

- exportData
- importData
- clearData

说明：

- `export/import/clear` 可在较后阶段接入远程端，但服务接口建议一开始就按目标结构预留

## 6. 客户端接入层重构设计

### 6.1 当前问题

当前 `packages/internal/store` 中的业务逻辑不是单一 capability 驱动，而是混合三种接入方式：

- DB service
- Electron IPC
- `api()`

远程接入要成功，必须先把它改造成“客户端 capability provider”模式。

### 6.2 目标模型

引入统一 capability 层：

```text
Store / Hooks
  -> Client Capabilities
      -> Desktop adapter
      -> Remote adapter
```

建议新增：

- `packages/internal/store/src/capabilities/`

建议内容：

- `types.ts`
- `desktop.ts`
- `remote.ts`
- `context.ts`

### 6.3 能力划分建议

不要让 capability 只包一个“大而全 API client”，而是按领域切分：

- `subscriptionCapabilities`
- `entryCapabilities`
- `feedCapabilities`
- `unreadCapabilities`
- `settingsCapabilities`
- `dataControlCapabilities`
- `integrationCapabilities`

每个 capability 负责：

- 查询
- 写入
- 实时事件消费后的缓存失效策略

### 6.4 对现有 store 的改造方向

#### 第一类：直接 IPC 调用

如：

- `subscription.store.ts`
- `unread.store.ts`
- `feed.store.ts`

改造方式：

- 将 `window.electron.ipcRenderer.invoke(...)` 替换为 capability 调用
- capability 在 desktop 下再走 IPC，在 remote 下走 HTTP

#### 第二类：本地 web fallback

如：

- 通过 `/api/rss-proxy` 本地解析 XML 的分支

改造方式：

- 从正式远程路径中移除这些开发兼容分支
- 正式远程访问统一经 main-process remote API

#### 第三类：现有 `api()` 在线能力

改造方式：

- 逐域判断是否保留外部 API 作为非核心能力
- 对于远程访问要覆盖的核心本地能力，应优先走主进程 remote API

## 7. Realtime 设计

### 7.1 事件模型

建议使用领域事件，而不是直接广播“请刷新整个页面”。

事件结构建议：

```ts
type DomainEvent = {
  id: string
  type: string
  at: string
  payload: unknown
}
```

一期事件类型建议：

- `subscription.created`
- `subscription.updated`
- `subscription.deleted`
- `entry.read.updated`
- `entry.unread.updated`
- `feed.refreshed`
- `refresh.started`
- `refresh.finished`
- `settings.updated`

### 7.2 客户端消费策略

客户端处理事件应分两种：

- 精准增量更新
- query invalidation

建议规则：

- 简单场景先 query invalidation，减少状态分叉风险
- 对高频事件如 `entry.read.updated`，可做增量更新优化

### 7.3 断线行为

远程端一旦失去事件流连接：

- 顶部显示显著连接断开提示
- 停止显示“同步正常”
- 对关键写操作直接报错，或要求先恢复连接后重试
- 重连成功后做一次关键 query resync

## 8. 远程 UI 设计

### 8.1 UI 复用原则

优先复用：

- 组件
- 样式
- 页面结构
- 业务视图层

避免复用：

- Electron preload 假设
- 直接读取 `window.electron`
- 依赖 `webview` 的实现细节

### 8.2 远程入口设计

推荐新增 remote 浏览器入口，而不是强行让当前主 entry 同时承担所有模式：

- `src/main.remote.tsx`
- `src/router.remote.tsx`

这样可以：

- 显式注入 remote capability provider
- 保持 desktop entry 稳定
- 减少到处散落的 `if (IN_ELECTRON)` 分支

### 8.3 Electron 专属能力映射

对 Electron 专属功能按类别处理：

- 可自然替代：
  - 文件上传 / 下载
  - 浏览器新标签打开
  - iframe 替代 webview
- 可远程代理：
  - 导出到 app 侧路径
  - 调用 app 侧集成动作
- 不可一比一映射但需保留可见性：
  - 托盘、dock、窗口管理

原则：

- 不 silently remove
- 不在一期追求所有行为 100% 一致
- 但必须在计划中逐项落位

## 9. 分阶段开发计划

### Phase 0：架构准备

目标：

- 先完成不会改变产品行为的结构性清理

任务：

1. 建立 `application/` 目录与基础 types
2. 建立 `remote/` 目录与 server skeleton
3. 建立 `store/capabilities/` 抽象
4. 为 desktop client 提供 capability adapter
5. 保持现有桌面行为不变

交付物：

- 编译通过
- 现有桌面功能不回归
- 具备继续抽离的基础骨架

风险：

- 容易做成空抽象

验收：

- 至少有一个真实域能力通过 capability 调用链跑通

### Phase 1：远程骨架 + 核心阅读链路

目标：

- 让远程浏览器能够访问并操作核心阅读功能

当前状态：

- 已基本完成，并且已经继续向“阅读优先”的远程可用形态深化

任务：

1. 启动 remote HTTP server
2. 提供 remote status 与 health endpoint
3. 抽离并接入：
   - subscriptions
   - entries
   - unread
   - feed preview
   - refresh
4. 建立 SSE 事件流
5. 实现 remote browser entry
6. 打通：
   - 订阅树
   - 条目列表
   - 详情阅读
   - 已读未读
   - 手动刷新
   - 新增 / 删除订阅

交付物：

- 浏览器可用的第一版 remote app
- 桌面端和远程端之间核心数据能实时收敛

风险：

- store 中 Electron 分支残留导致行为不一致

验收：

- 浏览器标记已读，桌面端即时反映
- 桌面端刷新 feed，浏览器端即时反映
- 事件流断开时 UI 明确报断开

### Phase 2：设置与管理能力补齐

目标：

- 让远程端覆盖主要管理类功能

当前状态：

- 尚未按原计划推进
- 产品优先级已调整为“阅读体验优先于后台管理能力”，因此本阶段被后置

任务：

1. 抽离 settings domain
2. 抽离 lists / collections
3. 远程设置页接入
4. 远程侧 query invalidation 策略完善
5. 桌面与远程对同一设置写入时的同步验证

交付物：

- 远程端可完成主要设置和管理动作

验收：

- 设置改动在双端间同步
- 列表、收藏等常用模块可远程使用

### Phase 3：数据控制与高级能力

目标：

- 接入 import/export、data-control、更多集成能力

任务：

1. 抽离 data-control application services
2. 定义 browser 等价文件流
3. 接入 import/export 远程流程
4. 处理高风险数据动作的浏览器端交互
5. 接入 integration 相关能力

交付物：

- 远程端进入高级可维护阶段

验收：

- 远程导出/导入可完成
- 高级操作具备明确反馈

### Phase 4：深度对齐与收尾

目标：

- 收敛残留双轨逻辑，提升长期可维护性

任务：

1. 清理 store 中剩余直接 IPC 调用
2. 清理远程无用 web fallback 分支
3. 统一错误模型
4. 补齐测试矩阵
5. 清理旧文档与构建遗留描述

交付物：

- 架构收敛后的稳定版本

验收：

- 核心域不再存在桌面专用的隐藏写路径
- 测试与文档同步完成

## 10. Backlog 拆分建议

为了让实现更可执行，下面给出建议 backlog 粒度。

### Epic A：Remote Server Foundation

- A1. 定义 remote config、status、lifecycle types
- A2. 创建 main-process server manager
- A3. 启动/停止/重启 server skeleton
- A4. 增加 `/health`、`/status` endpoint
- A5. 增加 SSE event endpoint
- A6. 在主进程启动/退出接入生命周期

### Epic B：Application Services Extraction

- B1. subscriptions service 抽离
- B2. entries/unread service 抽离
- B3. feed preview / refresh service 抽离
- B4. settings service 抽离
- B5. data-control service 抽离
- B6. integration service 抽离

### Epic C：Client Capability Layer

- C1. 定义 capability interfaces
- C2. desktop capability adapter
- C3. remote capability adapter
- C4. store 模块逐个迁移 capability
- C5. 删除直接 `window.electron` 调用

### Epic D：Remote Browser Shell

- D1. remote entry
- D2. remote router
- D3. remote capability provider
- D4. connection state UI
- D5. core pages接入

### Epic E：Realtime Sync

- E1. domain event schema
- E2. event emitter in application services
- E3. desktop-side event consumer
- E4. browser-side event consumer
- E5. reconnect + resync flow

### Epic F：Parity Expansion

- F1. settings completion
- F2. lists / collections completion
- F3. import/export completion
- F4. integration completion
- F5. Electron-specific behavior mapping

## 11. 测试计划

### 11.1 单元测试

- application service 输入输出
- 事件发布逻辑
- refresh 去重/并发控制
- capability adapter 映射

### 11.2 集成测试

- IPC adapter -> application service
- HTTP adapter -> application service
- SSE 事件发送
- reconnect 后 resync

### 11.3 端到端测试

- desktop 改读状态，remote 收敛
- remote 改读状态，desktop 收敛
- desktop 添加订阅，remote 收敛
- remote 刷新 feed，desktop 收敛
- 事件流断开时 remote UI 显示连接断开

### 11.4 回归重点

- unread 计数口径
- refresh 后读状态保留
- 订阅增删改
- settings 写入同步
- 批量操作与长任务状态

## 12. 主要风险与缓解

### 风险 1：共享服务层抽离不彻底

后果：

- 新的 HTTP adapter 与旧 IPC adapter 并存，业务逻辑继续复制

缓解：

- 把“共享服务层抽离”列为前置里程碑，而不是边开发边补

### 风险 2：客户端接入层继续双轨

后果：

- store 中继续堆积 `if (window.electron)` / `if (remote)` 判断

缓解：

- 先引入 capability provider，再迁移 store

### 风险 3：远程 UI 入口和 desktop 入口纠缠

后果：

- 启动逻辑复杂化
- Electron 专属分支散落

缓解：

- 独立 remote entry，复用组件但不强行共用启动入口

### 风险 4：实时同步策略过度乐观

后果：

- 双端并发写入时出现状态错觉

缓解：

- 先用 query invalidation 保守收敛
- 高频热点再逐步做增量优化

## 13. 推荐首个实现切片

推荐从下面这个最小可闭环切片开始：

### Slice 1：Remote Server Skeleton + Subscription Read Path

包含：

- remote server manager
- `/health`、`/status`
- subscription application service
- HTTP 获取订阅树接口
- remote browser entry + 简单订阅列表页

为什么先做它：

- 风险低
- 能最早验证主进程服务托管浏览器端的基本方向
- 不涉及大规模写入一致性问题

### Slice 2：Entry List + SSE

包含：

- entry listing API
- unread counts API
- SSE 管道
- remote 连接状态 UI

### Slice 3：Mark Read / Refresh

包含：

- entry read-state write path
- refresh write path
- 双端同步验证

完成这 3 个 slice 后，远程访问基础架构的正确性基本就能定型。

## 14. 实施建议

建议按以下节奏推进：

1. 先做结构性改造，不急着铺全部页面
2. 每个 phase 结束后都用桌面端 + 浏览器端双开做一致性验证
3. 优先解决共享服务层和 capability 层，不要先堆 HTTP route 数量
4. 所有新能力默认要求可被桌面端和远程端共同消费

## 15. 结论

这个需求本质上不是“增加一个浏览器页面”，而是把 `Suhui` 从“单桌面客户端”升级为“由 Electron main process 托管的本地多客户端应用”。

真正的关键工作有两件：

- 抽共享服务层
- 收敛客户端能力接入层

只要这两件事做对，HTTP server、SSE、remote UI 都是可控扩展；如果这两件事不做，远程访问会很快演化成另一套系统。

因此，开发计划必须把“架构收敛”放在“远程功能堆叠”之前，这也是本文档推荐的实施顺序。
