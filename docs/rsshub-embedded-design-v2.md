# FreeFolo 内嵌 RSSHub 方案设计 V2（历史草案）

> 状态：历史草案（已被 `docs/rsshub-embedded-design.md` 取代）
> 最后更新：2026-02-27
> 说明：保留用于设计演进对照，不作为当前实施基线。

---

## 一、范围与非目标

### 1.1 目标

- FreeFolo Desktop 内置本地 RSSHub 服务（sidecar 进程）
- 订阅输入支持：
  - `https://rsshub.app/...`
  - `rsshub://...`
  - 用户自定义 RSSHub 域名（可选）
- 对用户透明：无需单独安装 RSSHub

### 1.2 非目标

- 不保证“所有 RSSHub 路由”首版都可用
- 不在 V2 中实现“远程插件动态安装路由”
- 不在 V2 中引入云端同步或远端配置中心

---

## 二、关键前提与约束

- 运行环境依赖系统 Node.js（由用户机器提供，不由 Electron 自带）
- 最低 Node 版本：`>=20`（与当前 RSSHub 兼容策略对齐）
- 若检测到 Node 缺失或版本不满足，内置 RSSHub 自动降级为不可用，并给出明确错误提示

---

## 三、总体架构

```text
Renderer(订阅表单)
  -> IPC(db.previewFeed/db.addFeed)
    -> Main(DbService.fetchUrl)
      -> resolveRsshubUrl(url)
      -> RsshubManager.ensureRunning()
      -> fetch(local rsshub endpoint)
```

- RSSHub 以独立子进程运行，主进程仅做生命周期管理与请求转发
- 子进程崩溃不影响 FreeFolo 主进程
- 所有对 `rsshub.app` 的访问在本地改写到 `127.0.0.1:<port>`

---

## 四、打包与资源路径（统一策略）

> 仅保留一套路径策略，避免 `asar.unpack` 与 `extraResource` 混用导致歧义。

- 使用 `electron-forge` `extraResource` 分发 RSSHub 运行目录
- 运行时根路径：`process.resourcesPath/rsshub`
- 禁止依赖 `app.asar.unpacked/rsshub` 作为主路径

目录示例：

```text
<resources>/rsshub/
  package.json
  dist/index.js
  node_modules/
  routes-manifest.json
```

---

## 五、RsshubManager 设计

文件建议：`apps/desktop/layer/main/src/manager/rsshub.ts`

### 5.1 状态机

- `stopped`
- `starting`
- `running`
- `error`
- `cooldown`（重试上限后冷却态）

### 5.2 启停接口

- `start(): Promise<{ port: number }>`
- `stop(): Promise<void>`
- `ensureRunning(): Promise<number>`
- `getStatus(): RsshubStatus`

### 5.3 启动判定（必须）

禁止用日志文本判定成功；改为健康探针：

- 启动后每 500ms 探测 `GET /healthz`（或保底 `GET /`）
- 超时阈值：10s
- 成功：转 `running`
- 失败：进入重试流程

### 5.4 重试与冷却

- 最大重试：3 次
- 退避：1s / 2s / 4s
- 仍失败：进入 `cooldown`（5 分钟）
- `cooldown` 期间仅允许手动“立即重试”触发

---

## 六、URL 改写规则（精确定义）

### 6.1 命中条件

- host 为 `rsshub.app`
- schema 为 `rsshub:`
- host 命中用户设置的自定义 RSSHub 域名（可选）

### 6.2 统一改写

- 目标基址：`http://127.0.0.1:<port>`
- 必须保留 `pathname + search + hash`
- `rsshub://github/trending?since=daily` -> `/github/trending?since=daily`

### 6.3 服务不可用行为（必须）

命中 RSSHub URL 且本地 RSSHub 不可用时：

- 不回退到公网 `rsshub.app`
- 直接返回结构化错误：
  - `code: RSSHUB_LOCAL_UNAVAILABLE`
  - `message: 内置 RSSHub 未启动或启动失败`

---

## 七、安全与资源控制

### 7.1 网络边界

- RSSHub 仅绑定 `127.0.0.1`
- 禁止 `0.0.0.0`

### 7.2 本地访问保护

- 启动时生成随机 token（仅进程内保存）
- 主进程转发时附带 header：`x-freefolo-token`
- RSSHub 入口中间件校验 token

### 7.3 资源配额

- 请求超时：20s
- 最大并发抓取数：8
- 缓存目录上限：500MB（可配置）
- 日志轮转：单文件 10MB，保留 5 个

---

## 八、IPC 与 UI

### 8.1 IPC

在 `DbService` 新增：

- `getRsshubStatus()`
- `toggleRsshub(enabled: boolean)`
- `restartRsshub()`

### 8.2 设置页（最小可用）

- 开关：启用内置 RSSHub
- 状态：`运行中/启动中/错误/冷却中`
- 诊断信息：
  - Node 版本
  - 当前端口
  - 最近错误摘要
- 操作：`重启 RSSHub`

---

## 九、实现分期（可执行）

### P0：最小闭环（必须先落地）

- RsshubManager（启动/停止/健康检查/重试）
- `resolveRsshubUrl`（含 query/hash 保留）
- `db.previewFeed` 与 `db.addFeed` 接入
- 明确错误码与 UI 提示

验收标准：

- `rsshub.app` URL 在本地成功改写并返回 XML
- 本地 RSSHub 停止时 UI 明确提示，不再出现泛化“获取订阅元出错”

### P1：稳态与可运维

- 设置页状态面板
- token 校验、并发/超时/日志轮转
- 冷却与手动重试

### P2：路由覆盖扩展

- 路由白名单扩展
- 路由可用性探测与灰度开关

---

## 十、测试与验收

### 10.1 单测

- URL 改写：`https://rsshub.app` / `rsshub://` / query/hash
- 状态机：`starting -> running -> error -> cooldown`
- 错误码：`RSSHUB_LOCAL_UNAVAILABLE`

### 10.2 集成测试

- Electron 主进程拉起 RSSHub 子进程
- `db.previewFeed` 命中本地 RSSHub 成功返回
- 关停 RSSHub 后订阅提示正确

### 10.3 人工回归

- 编辑订阅、取消订阅不受 RSSHub 进程波动影响
- 应用退出后 RSSHub 子进程不残留

---

## 十一、风险清单（更新）

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| 系统无 Node 或版本不符 | 高 | sidecar 无法启动 | 启动前检测 + UI 引导 |
| RSSHub 路由兼容性波动 | 中 | 上游变更导致路由失效 | 锁版本 + 路由健康检测 |
| 子进程崩溃循环 | 中 | 持续占用资源 | 退避 + cooldown |
| 本地服务被滥用 | 中 | 同机进程滥调接口 | 127.0.0.1 + token 校验 |
| 包体增大 | 中 | 下载与升级成本增加 | 分层资源包 + 后续按需裁剪 |

---

## 十二、POC 验收门槛（继续/终止决策）

POC 只验证三件事：

1. 能在 Electron 主进程稳定拉起 sidecar，并通过健康探针进入 `running`
2. `rsshub.app` 与 `rsshub://` 改写可用，且 query/hash 不丢失
3. 失败时给出明确错误码与文案，不再是泛化错误

满足 1/2/3 才进入 P0 实装。
