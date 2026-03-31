# 任务计划：Suhui 远程浏览器访问详细设计与开发计划

## 目标

基于已确认的远程访问 spec，输出一份可执行的详细设计和分阶段开发计划，用于指导后续实现 Suhui 的浏览器远程访问能力。

## 当前阶段

阶段 6

## 各阶段

### 阶段 1：需求与发现

- [x] 理解用户意图
- [x] 确定约束条件和需求
- [x] 将发现记录到 findings.md
- **状态：** complete

### 阶段 2：规划与结构

- [x] 梳理现有代码中的主进程、IPC、renderer、构建边界
- [x] 细化远程访问目标架构和模块职责
- [x] 输出开发阶段、任务拆分、风险与验证计划
- **状态：** complete

### 阶段 3：文档落地

- [x] 产出详细设计与开发计划文档
- [x] 进行自检，消除歧义和冲突
- [x] 提交到 git
- **状态：** complete

### 阶段 4：用户审阅

- [x] 向用户提供文档路径和核心结论
- [x] 根据用户反馈迭代文档
- **状态：** complete

### 阶段 5：后续实现准备

- [x] 形成可以直接进入实现的阶段计划
- [x] 明确首个 implementation slice
- **状态：** complete

### 阶段 6：Slice 1 实现

- [x] 建立 remote server skeleton
- [x] 提供 `/health`、`/status`、`/api/subscriptions` 只读接口
- [x] 接入主进程启动与关闭生命周期
- [x] 提供最小 remote browser shell
- [x] 补充 entry list 只读接口与最小 SSE 连接状态
- [x] 补充 unread counts 只读接口与订阅未读展示
- [x] 打通最小 read-state 远程写接口
- [x] 打通单 feed refresh 远程写接口
- [x] 打通 refresh-all 远程写接口
- [x] 建立正式 remote browser entry，并接入 renderer 多入口构建
- [x] 打通 entry detail 读取与 remote detail 展示
- [x] 打通 subscription create/delete 远程写接口
- [x] 在正式 remote client 中补充最小订阅管理 UI（新增/删除）
- [x] 打通 subscription update 远程写接口
- [x] 在正式 remote client 中补充订阅编辑 UI（标题/分类/view）
- [x] 打通 entries unread-only 远程筛选接口
- [x] 在正式 remote client 中补充阅读增强交互（标未读、未读筛选、上一条/下一条）
- [x] 在正式 remote client 中补充条目元信息展示（作者/原文链接）
- [x] 在正式 remote client 中补充读完自动前进的阅读导航逻辑
- [x] 在正式 remote client 中补充阅读列表排序（最新/最旧/未读优先）
- [ ] 补充更多远程 capability 与 remote client 深化集成
- **状态：** in_progress

## 关键问题

1. 如何在不复制业务逻辑的前提下，把现有 IPC 主链路收敛成 HTTP + IPC 共用服务层。
2. 如何分阶段交付远程端全功能目标，同时控制实现复杂度和回归风险。

## 已做决策

| 决策                                                    | 理由                                                      |
| ------------------------------------------------------- | --------------------------------------------------------- |
| 远程访问方案采用主进程内嵌 HTTP 服务 + 远程浏览器客户端 | 与当前 desktop-only、本地优先、主进程持有真相源的架构一致 |
| 远程访问与桌面端同权                                    | 这是用户明确确认的产品要求                                |
| 不增加认证、访问码、额外确认等硬边界                    | 这是用户明确确认的产品要求                                |
| 主进程必须是唯一写入口                                  | 避免桌面端与浏览器端出现数据分叉                          |
| 远程事件流断开时必须显式提示连接断开                    | 这是唯一保留的明确运行时硬约束                            |

## 遇到的错误

| 错误                               | 尝试次数 | 解决方案                                                            |
| ---------------------------------- | -------- | ------------------------------------------------------------------- |
| 仓库中无 `writing-plans` skill     | 1        | 使用 `planning-with-files-zh` 作为最接近的文件化规划替代流程        |
| 首次 remote 测试命令路径错误       | 1        | 改为在 `apps/desktop/layer/main` 下运行 `vitest run src/remote/...` |
| 主进程 `typecheck` 被历史问题阻塞  | 1        | 记录为基线问题，本轮先以新增 remote 测试通过作为验证依据            |
| entry 查询默认依赖主进程模块副作用 | 1        | 将 `entryApplicationService` 改为 lazy import，避免测试初始化噪音   |

## 备注

- 详细设计必须对齐已提交 spec：`docs/superpowers/specs/2026-03-31-remote-browser-access-design.md`
- 计划需要可直接转化为 implementation backlog，而不只是高层方向
- 当前实现已完成 `Slice 1` 与 `Slice 2` 的主要只读能力，下一步进入真实事件广播与写路径
- 当前实现已完成最小 remote API、正式 remote browser entry 与第一批订阅管理能力，后续优先继续扩展远程端管理能力，并逐步淘汰临时 inline shell 的职责
