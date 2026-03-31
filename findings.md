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

## 技术决策

| 决策                                                                          | 理由                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| 采用“Application Services <- IPC/HTTP adapters <- Desktop/Remote clients”结构 | 避免重复业务逻辑，便于一致性控制                   |
| 远程访问服务内嵌到 Electron main process                                      | 当前所有权威状态和关键能力已经集中在主进程         |
| Realtime 同步优先采用事件广播                                                 | 多客户端并发写入下需要统一收敛状态                 |
| 实现按阶段推进，但总目标保持为广泛功能对齐                                    | 远程端最终要和桌面端同权，但不能一次性硬推全部改造 |
| 详细开发计划需要单独把“共享服务层抽离”和“客户端接入层收敛”列为前置工作流      | 仅加 HTTP server 无法解决现有 store 双轨耦合问题   |

## 遇到的问题

| 问题                         | 解决方案                                       |
| ---------------------------- | ---------------------------------------------- |
| `writing-plans` skill 不可用 | 用文件化规划流程替代，并将计划文档直接写入仓库 |

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
