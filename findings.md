# 发现与决策

## 需求

- 用户希望当本机运行 `Suhui` app 时，可通过浏览器以 `IP + 端口` 访问。
- 访问场景定位为局域网或 VPN 内。
- 远程端目标不是只读 companion，而是逐步达到接近桌面端全功能。
- 远程访问与桌面端同权。
- 用户明确不要求额外认证、访问码、随机端口、额外确认等产品限制。
- 若远程 realtime 事件流断开，前端必须显式显示连接断开，不得伪装为成功写入。

## 研究发现

- 仓库当前为 `desktop-only`，`AI-CONTEXT.md` 已明确 `apps/mobile` 与 `apps/ssr` 已移除。
- 当前不存在现成的主进程 HTTP server 主链路；主进程核心是 Electron window、IPC、DB 管理和本地 RSS 刷新。
- 现有 renderer 虽保留 `WEB_BUILD`、PWA、browser router 等逻辑，但当前主链路数据库访问依赖 Electron IPC，不能直接作为独立远程 web app 使用。
- 现有最佳演进方向不是恢复历史 web 端，而是让主进程暴露远程 API，并让浏览器端作为新客户端接入。
- IPC 注册入口集中在 `apps/desktop/layer/main/src/ipc/index.ts`，是未来抽薄 adapter 的自然切入点。
- 主进程启动集中在 `apps/desktop/layer/main/src/manager/bootstrap.ts`，适合在此挂载远程服务生命周期。
- renderer 启动统一经 `apps/desktop/layer/renderer/src/main.tsx` 和 `initialize/index.ts`，说明远程 browser client 可以沿用大部分 app 初始化骨架，但必须替换 Electron 相关依赖注入。
- `packages/internal/store` 目前同时混用了 `api()` 和 `window.electron.ipcRenderer` 分支，说明客户端数据访问层存在双轨耦合，需要专门收敛。
- 订阅、未读、feed 预览等模块已有明显 Electron 分支和 web fallback 分支，但这些 fallback 目前更像开发兼容逻辑，不是可维护的正式远程访问架构。
- `BootstrapManager` 的 `app.whenReady()` 是接入 remote server 生命周期的合适位置；退出路径需显式关闭 server，避免端口残留。
- 通过依赖注入让 `RemoteServerManager` 接收 `getSubscriptions` provider，可以在不初始化 DB 的情况下稳定做 HTTP 集成测试。
- 通过依赖注入让 `RemoteServerManager` 接收 `getEntries` provider，可在不触发主进程 DB/logger 副作用的情况下覆盖 entry API 测试。
- 当前 `@suhui/electron-main` 的 `typecheck` 本身就被多处历史配置/测试问题阻塞，不能作为本次 remote 改动的有效回归门禁。
- 在不改 renderer 构建链的前提下，可先由主进程直接托管最小 HTML + JS shell，快速验证 remote browser 端访问链路。
- 现阶段 SSE 已能提供连接建立和保活信号，适合作为后续真实领域事件广播的传输骨架。
- 通过在 `RemoteServerManager` 内部维护 SSE client 集合并提供 `broadcast()`，可以先建立最小领域事件广播骨架，而不必一开始就引入更重的事件总线抽象。
- 在主进程直接托管的最小 remote shell 中，先做 subscription -> entry list 的两栏结构，可以更快验证浏览器端主阅读链路，而不必立即接入完整 renderer。
- unread counts 读取可直接经主进程 `unreadTable` 暴露，不必等待 renderer store 收敛后再做。
- read-state 写路径可以先通过单一 `POST /api/entries/read` 收口，浏览器端只依赖事件刷新，不直接维护另一套写模型。
- feed 刷新同样可以先经单一 `POST /api/feeds/:feedId/refresh` 收口，直接复用主进程现有 `FeedRefreshService`，避免复制 IPC `DbService.refreshFeed` 的复杂实现。
- `refresh-all` 可以沿用同一模式，通过 `FeedRefreshService.refreshAll()` 收口到单一 HTTP endpoint，无需额外引入任务编排层。
- renderer 构建链本身支持多 HTML 入口，因此正式 remote client 可以通过新增 `remote.html + src/remote/main.tsx` 接入，而不必另起一套前端工程。
- 主进程 remote server 适合采用“正式 remote client 优先、inline shell 兜底”的托管策略：dev/prod 有正式资产时优先服务，没有时保留旧 fallback，降低迁移风险。
- entry detail 读取可以直接复用本地 `entriesTable` 单条查询，不必先把桌面端复杂的 `EntryContent` 渲染链整体搬到 remote client；先显示基础 HTML 内容更稳。
- subscription 管理可以先收口到 `POST /api/subscriptions` 与 `DELETE /api/subscriptions/:id` 两个 endpoint，先覆盖新增/删除，再把编辑能力后续补齐。
- 新增订阅当前最稳的复用路径是调用现有 `DbService.addFeed()`，这样能直接继承桌面端已存在的 feed 解析、去重与入库逻辑，避免在 remote 路径重写一份。
- 正式 remote client 中的订阅管理 UI 先保持极简即可：URL + 可选标题创建、列表项删除；这足以验证“远程端与桌面端共用写入口”的关键链路。
- 订阅编辑同样可以先只暴露 `title/category/view` 三个字段；这已经覆盖远程管理最核心的元数据维护需求。
- remote 端创建订阅默认 view 不应写死魔法数字，应该显式使用 `FeedViewType.Articles` 作为默认值，否则会把新订阅落到错误分组。
- 阅读体验增强优先级应高于后台管理能力，远程端先补 `unreadOnly`、`mark unread`、`prev/next` 这类高频阅读动作，收益比设置和批量操作更高。
- `mark unread` 不需要新增后端写接口，直接复用现有 `POST /api/entries/read` 的 `read=false` 即可，关键在于前端把它纳入正式交互。
- `unreadOnly` 更适合做成后端查询参数而不是纯前端过滤，这样在远程端刷新、SSE 回推和切换 feed 时都能保持一致口径。

## 技术决策

| 决策                                                                          | 理由                                                     |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| 采用“Application Services <- IPC/HTTP adapters <- Desktop/Remote clients”结构 | 避免重复业务逻辑，便于一致性控制                         |
| 远程访问服务内嵌到 Electron main process                                      | 当前所有权威状态和关键能力已经集中在主进程               |
| Realtime 同步优先采用事件广播                                                 | 多客户端并发写入下需要统一收敛状态                       |
| 实现按阶段推进，但总目标保持为广泛功能对齐                                    | 远程端最终要和桌面端同权，但不能一次性硬推全部改造       |
| 详细开发计划需要单独把“共享服务层抽离”和“客户端接入层收敛”列为前置工作流      | 仅加 HTTP server 无法解决现有 store 双轨耦合问题         |
| Slice 1 先实现主进程 remote server skeleton 与只读订阅查询                    | 这是最小可运行闭环，且不会过早引入复杂写路径一致性问题   |
| 最小 remote browser shell 先由主进程直接托管，而不是立刻接入 renderer 构建链  | 这样能更快验证浏览器访问能力，降低早期改造风险           |
| 在真实广播落地前，SSE 先承载 `ready/ping` 连接状态                            | 先把远程端“连接断开必须显式提示”的硬约束做实             |
| read-state 远程写入先收口为单一 HTTP endpoint                                 | 先验证主进程单一写入口，再逐步扩到 refresh 等写能力      |
| refresh 远程写入直接复用 `FeedRefreshService`                                 | 避免复制 `DbService.refreshFeed` 的大段逻辑              |
| refresh-all 远程写入直接复用 `FeedRefreshService.refreshAll()`                | 保持写路径简单一致，避免过早引入调度抽象                 |
| 正式 remote client 接入 renderer 多入口构建                                   | 复用现有 Vite/Electron 构建链，避免维护第二套前端工程    |
| entry detail 先在 remote client 侧做轻量 HTML 展示                            | 先确保可读与可维护，再考虑复用桌面端完整渲染体系         |
| subscription create 先复用 `DbService.addFeed()`                              | 直接继承已存在的桌面端 add-feed 逻辑，降低远程写路径分叉 |
| subscription 管理先落最小 create/delete UI                                    | 先打通远程端管理闭环，再逐步补编辑和更细能力             |
| subscription update 先只支持 `title/category/view`                            | 覆盖核心管理诉求，同时保持 API 和前端复杂度可控          |
| 阅读增强优先补 `unreadOnly`、`mark unread`、`prev/next`                       | 这些是远程阅读端最高频、最直接影响可用性的动作           |

## 遇到的问题

| 问题                                | 解决方案                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| `writing-plans` skill 不可用        | 用文件化规划流程替代，并将计划文档直接写入仓库               |
| 主进程 `typecheck` 出现大量历史错误 | 记录为现有基线问题，本轮先以新增 remote 测试通过作为验证依据 |

## 资源

- `docs/superpowers/specs/2026-03-31-remote-browser-access-design.md`
- `AI-CONTEXT.md`
- `apps/desktop/layer/main/src`
- `apps/desktop/layer/renderer/src`
- `packages/internal/store`
- `packages/internal/database`

## 视觉/浏览器发现

- 本轮为架构与开发计划规划，无额外视觉结论。

---

_每执行2次查看/浏览器/搜索操作后更新此文件_
_防止视觉信息丢失_
