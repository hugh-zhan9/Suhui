# 最终评审报告

## 修改摘要

本次重构完成了共享有界条目查询、IPC/HTTP transport 统一、projection-aware store、有界 Desktop 启动 hydration、批量刷新 ChangeSet、Remote 渐进启动、侧栏与启动依赖优化，以及可审计的 production 性能和 Forge artifact 门禁。

首次规格评审发现两项 Important 证据缺口：feed 指标没有执行真实 view 切换，以及 TC-1/TC-2 没有穿过真实 PostgreSQL 与两个 transport。修复后加入真实 All/Articles 切换采样、隔离 PostgreSQL/IPC/HTTP 集成测试，并修正真实执行暴露的 collection 子查询 alias 问题。复审未发现剩余问题。

## 评审范围

- start_commit: `01f18d72b6a946b8d2ca2501741c12255ac6e174`
- review_head: `c3064c2550bc56b6ae1020e10b79ad2b1e5d0321`
- tracked_diff_included: `yes`
- 使用的 diff 命令:
  - `git diff 01f18d72b6a946b8d2ca2501741c12255ac6e174..c3064c255`
  - `git diff --check 01f18d72b6a946b8d2ca2501741c12255ac6e174..c3064c255`
- 明确排除的用户改动：`.gitignore`、`.vscode/settings.json`、`.idea/Suhui.iml`

## 需求 / 设计一致性

| 设计点 / 需求                                   | 实现证据                                                                                                 | 状态   | 备注                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| `AC-1`,`AC-2`; `D-001`-`D-004`; `TC-1`,`TC-2`   | `query-builder.ts`、`query-service.ts`、`db.ts`、`remote/manager.ts`、`entry-query-transport.pg.test.ts` | 已一致 | 真实 PostgreSQL 首/次页与实际 IPC/HTTP adapter parity 通过 |
| `AC-3`; `D-005`,`D-006`; `TC-3`                 | startup snapshot/readiness、projection-aware store、production startup samples                           | 已一致 | 启动窗口有界，interactive 定义未改变                       |
| `AC-4`; `D-007`,`D-013`; `TC-4`                 | versioned ChangeSet、invalidation coordinator、refresh evidence                                          | 已一致 | 1/10/50 feeds 均 event/refetch/reload=1                    |
| `AC-5`; `D-008`; `TC-5`                         | Remote bootstrap/entries 独立状态与 production browser failure evidence                                  | 已一致 | shell-first，错误不计 ready，retry 成功                    |
| `AC-6`; `D-009`,`D-010`,`D-012`,`D-013`; `TC-6` | sidebar/lazy tests、真实 feed/view switch、482 production samples                                        | 已一致 | 四组 feed switch P95 均小于 300ms                          |
| `AC-7`,`AC-8`; `D-012`-`D-014`; `TC-6`          | normal/stress cold/warm、raw/report、SQL EXPLAIN                                                         | 已一致 | 24 个 mandatory groups 全部 pass，无 DB 持久层变更需求     |
| `AC-9`; `D-011`; `TC-7`                         | Forge ignore、真实 app artifact inspection                                                               | 已一致 | `rsshubPaths=[]`，必需资源 23/23                           |

## 需求覆盖矩阵

| Source anchors  | 覆盖结果 | 核心证据                                                              |
| --------------- | -------- | --------------------------------------------------------------------- |
| `AC-1`-`AC-3`   | 3/3      | 有界 summary/keyset、共享 transport 语义、启动窗口与 detail policy    |
| `AC-4`-`AC-5`   | 2/2      | refresh 收敛、Remote shell/loading/error/retry                        |
| `AC-6`-`AC-9`   | 4/4      | Desktop/Remote P95、固定 fixture、Forge artifact                      |
| `D-001`-`D-005` | 5/5      | shared query、cursor、projection、compatibility、page/store ownership |
| `D-006`-`D-010` | 5/5      | startup、refresh、Remote、sidebar、lazy dependency graph              |
| `D-011`-`D-014` | 4/4      | packaging、performance statistics、observability、DB stop gate        |
| `TC-1`-`TC-3`   | 3/3      | 真实 PG 双页/transport parity、production startup                     |
| `TC-4`-`TC-7`   | 4/4      | refresh、Remote failure、production P95、真实 Forge                   |

总覆盖：`30/30` source anchors。

## 声明与证据层级审计

| 声明 / 需求                   | 声明表面                  | 所需证据                      | 实际证据                                                                                       | 结论   |
| ----------------------------- | ------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| 列表分页与 transport 语义一致 | DB/API/IPC                | 真实 DB 结果和实际 adapter    | 隔离 PostgreSQL、production `EntryQueryService`、`DbService`、HTTP server，10/10；组合 114/114 | 已支撑 |
| Desktop feed/unread 切换 P95  | production Electron UI    | 真实 identity 切换、每组 >=20 | All/Articles 实际按钮切换；normal cold/warm `69.9/65.8ms`，stress `131.6/95.6ms`               | 已支撑 |
| Remote shell/data/error/retry | production browser        | 页面可见状态和失败注入        | cold/warm samples、bootstrap/entries failure evidence、retry final success                     | 已支撑 |
| refresh 不放大                | runtime producer/consumer | 不同 N 的事件与 refetch 计数  | 1/10/50 feeds 均为 1/1/1                                                                       | 已支撑 |
| SQL 无持久层变更需求          | PostgreSQL                | 真实 SQL 与 EXPLAIN           | normal/stress 共 8 个计划，最大 execution `22.955ms`                                           | 已支撑 |
| RSSHub 未进入产物             | Forge artifact            | 真实 resources/app.asar 扫描  | `rsshubPaths=[]`，required paths 23/23，package tests 12/12                                    | 已支撑 |

## 支持视角风险扫描

- API：IPC/HTTP 共用 application query 语义；HTTP 保留 URI/method/`data`，`page` 为 additive；非法 scope 稳定返回 400。
- Architecture：main application 层拥有查询语义，React Query 拥有页成员关系，normalized store 只合并 projection；Remote metadata/entries/SSE 状态边界独立。
- SQL：summary allowlist、`limit+1`、三字段 DESC keyset、`IS NOT TRUE`、参数绑定和显式 collection alias 已由真实 PostgreSQL 验证。
- Scope：没有 schema、index、migration、database engine、config precedence 或 lockfile 变化。

## 运行时验证结果

- build identity：`65027c2b83e7ba13755ded9747d651f28070d75fabc6c7cdfc6f31d674b1c65e`；HEAD `c3064c255`；production source `dirty=false`。
- artifact verifier：482 samples，24 groups，`gate=pass`，无 evidence gap。
- Desktop feed switch P95：normal cold/warm `69.9/65.8ms`；stress cold/warm `131.6/95.6ms`。
- Remote data-ready P95：normal cold/warm `84/91ms`；stress cold/warm `193/201ms`。
- PostgreSQL/query/IPC/HTTP：4 files，114/114；真实 PG transport 10/10。
- renderer metric/timeline：19/19；runner 3/3；package artifact tests 12/12。
- Forge unsigned build 成功；`rsshubPaths=[]`；required paths 23/23。

## 测试可信度

**等级：** 高

**证据：** production Electron/browser、真实隔离 PostgreSQL、真实 IPC/HTTP adapter、raw sample 重算、build identity fail-closed、真实 Forge artifact。

**跳过的检查：** 未在非 macOS/arm64 平台重复 Forge；全仓 typecheck 仍有已记录的 main rootDir/file-list 与 renderer `useEntryContextMenu.ts:41` 基线诊断。

**剩余风险：** 上述基线诊断不涉及本次文件；production build 和所有目标表面验证通过。设计未要求跨平台 artifact 门禁。

## 代码评审发现

- Critical：无。
- Important：无。
- Minor：无。

## 回归评估

未发现接口、行为、持久化、刷新、Remote 恢复、启动 readiness 或 artifact 回归。旧 `db.getEntries` 兼容入口仍强制最多 100 条 summary；agent DTO、Remote URI/method/event 名保持兼容；用户编辑器配置未被纳入实现提交。

## 复审记录

| 评审时间               | review_head | 上次结论     | 本次结论 | 已修复问题摘要                                                                                 |
| ---------------------- | ----------- | ------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `2026-07-15T22:26:00Z` | `c3064c255` | `With fixes` | `Yes`    | 增加真实 feed/view switch P95；补真实 PostgreSQL/IPC/HTTP TC-1/TC-2；修正 collection SQL alias |

## 总体结论

**Ready for finish?** Yes

**覆盖情况：** 30/30 项 source anchors 已完全覆盖

**运行时验证：** 已验证

**回归评估：** 无问题

**阻塞问题：** 无
