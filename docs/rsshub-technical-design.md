# FreeFolo 内嵌 RSSHub 技术设计文档

> 版本：1.1 | 最后更新：2026-02-28
> 关联文档：[开发计划](./rsshub-dev-plan.md) | [总方案](./rsshub-embedded-design.md) | [AI 上下文](../AI-CONTEXT.md)

## 0. 当前实现对齐说明

- 当前代码已支持 `Lite/Official` 双模式：
  - Lite：轻量内置路由（白名单）
  - Official：内嵌官方运行时（全量链路）
- 启动策略默认：`spawn + ELECTRON_RUN_AS_NODE=1`，可通过环境变量切回 `fork`
- 运行时入口脚本已按打包环境适配（避免 `pathe` 缺失导致子进程启动失败）

---

## 一、范围与非目标

### 1.1 目标

在 FreeFolo Electron 内部静默运行一个最小化 RSSHub 实例，让用户零配置使用 RSSHub 路由，输入 `https://rsshub.app/xxx` 或 `rsshub://xxx` 可直接订阅。

### 1.2 非目标（V1 不做）

- 不保证全部 1000+ 路由首版均可用，仅内置 Top 30
- 不实现远程插件动态安装路由
- 不引入云端同步或远端配置中心

---

## 二、整体架构

```
Renderer（订阅表单）
  → IPC（db.previewFeed / db.addFeed）
    → Main（DbService.resolveRsshubUrl）
      → RsshubManager.ensureRunning()
        → spawn(ELECTRON_RUN_AS_NODE=1) / fork(resources/rsshub/index.js)
          ↳ RSSHub 子进程（127.0.0.1:PORT）
      → fetchUrl(localUrl, token)
```

**关键约束**：

- 默认使用 `spawn(process.execPath, ...) + ELECTRON_RUN_AS_NODE=1`，复用 Electron 内置 Node.js，**无需目标机器安装 Node**
- 保留 `fork()` 作为兼容策略（实验与回退）
- 子进程崩溃不影响主进程，指数退避自动重启
- 仅绑定 `127.0.0.1`，随机 token 鉴权，防止本机其他进程滥用

---

## 三、打包与资源路径

**统一策略**：使用 `extraResource`，禁止混用 `asar.unpack`。

```typescript
// forge.config.cts
packagerConfig: {
  extraResource: [
    "./resources/app-update.yml",
    "./resources/rsshub",  // 新增
  ],
  asar: { unpack: "**/*.node" },  // 保持原样
}

// 运行时路径解析
const rsshubDir = app.isPackaged
  ? path.join(process.resourcesPath, "rsshub")
  : path.join(app.getAppPath(), "resources/rsshub")
const rsshubBundlePath = path.join(rsshubDir, "index.js")
```

**RSSHub bundle 目录结构**：

```
resources/rsshub/
  index.js          ← esbuild 精简打包产物（目标 < 30MB）
  routes-manifest.json
```

---

## 四、RsshubManager 设计

**文件**：`apps/desktop/layer/main/src/manager/rsshub.ts`

### 4.1 状态接口

```typescript
type RsshubStatus = "stopped" | "starting" | "running" | "error" | "cooldown"

interface RsshubManagerState {
  process: ChildProcess | null
  port: number | null
  token: string | null // 随机访问 token，每次重启刷新
  status: RsshubStatus
  retryCount: number
  cooldownUntil: number | null // timestamp（ms），冷却期结束时间
}

class RsshubManager {
  async start(): Promise<{ port: number; token: string }>
  async stop(): Promise<void>
  async restart(): Promise<void> // 供渲染层手动触发
  ensureRunning(): Promise<number> // 幂等，已运行直接返回 port
  getState(): Pick<RsshubManagerState, "status" | "port" | "token">
  private healthCheck(port: number, token: string): Promise<boolean>
  private scheduleRetry(): void // 指数退避
}

export const rsshubManager = new RsshubManager()
```

### 4.2 状态机

```
stopped
  → starting（调用 start()）
      → running（健康探针 200）
      → error（探针超时 10s）
          → starting（退避重试，1s/2s/4s，最多 3 次）
          → cooldown（3 次失败后，冷却 5 分钟）
              → starting（冷却期满自动触发 1 次，或用户手动重启）
```

> `cooldown` 期间禁止自动重试，仅用户手动触发，防止持续崩溃耗尽资源。

### 4.3 生命周期

```
应用启动
  └─ portfinder 获取可用端口
  └─ token = crypto.randomBytes(32).toString('hex')
  └─ fork(rsshubBundlePath, [], { env: { PORT, NODE_ENV, RSSHUB_TOKEN } })
  └─ 轮询 GET /healthz（500ms/次，超时 10s）
       200 → status = "running"
       超时 → 进入重试流程

应用退出（before-quit）
  └─ process.kill() + 等待 exit（超时 3s 强杀）

子进程崩溃（process exit）
  └─ 退避重试：1s → 2s → 4s（3 次上限）
  └─ 失败 → cooldown 5min + IPC 通知渲染层
```

---

## 五、URL 改写

**文件**：`apps/desktop/layer/main/src/ipc/services/db.ts`

### 5.1 命中规则

| 条件                        | 示例                                             |
| --------------------------- | ------------------------------------------------ |
| `hostname === "rsshub.app"` | `https://rsshub.app/github/trending?since=daily` |
| `protocol === "rsshub:"`    | `rsshub://github/trending?since=daily`           |
| 用户自定义域名              | 设置中配置                                       |

### 5.2 改写逻辑

```typescript
function resolveRsshubUrl(url: string): { resolvedUrl: string; token: string | null } {
  let isRsshubUrl = false
  let resolvedPath = ""

  try {
    const parsed = new URL(url)
    if (parsed.hostname === "rsshub.app") {
      isRsshubUrl = true
      resolvedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`
    } else if (parsed.protocol === "rsshub:") {
      isRsshubUrl = true
      // rsshub://ns/route?q=1 → /ns/route?q=1
      resolvedPath = `/${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    /* 非合法 URL，原样返回 */
  }

  if (!isRsshubUrl) return { resolvedUrl: url, token: null }

  const { status, port, token } = rsshubManager.getState()

  // 明确报错，禁止静默回退到公网 rsshub.app
  if (status !== "running" || !port) {
    const err = new Error("内置 RSSHub 未运行，请在设置中启动或配置自定义实例")
    ;(err as any).code = "RSSHUB_LOCAL_UNAVAILABLE"
    throw err
  }

  return { resolvedUrl: `http://127.0.0.1:${port}${resolvedPath}`, token }
}

// 调用侧
const { resolvedUrl, token } = resolveRsshubUrl(feedUrl)
const xmlText = await fetchUrl(resolvedUrl, token)
```

### 5.3 结构化错误码

| 错误码                       | 触发条件                                  |
| ---------------------------- | ----------------------------------------- |
| `RSSHUB_LOCAL_UNAVAILABLE`   | 命中 RSSHub URL 但服务 status ≠ "running" |
| `RSSHUB_HEALTHCHECK_TIMEOUT` | 健康探针 10s 内未返回 200                 |
| `RSSHUB_TOKEN_REJECTED`      | 子进程中间件校验 token 失败（HTTP 403）   |

### 5.4 fetchUrl 扩展

```typescript
function fetchUrl(url: string, rsshubToken?: string | null, redirectCount = 0): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "FreeFolo RSS Reader/1.0",
    Accept: "application/rss+xml, application/atom+xml, application/xml, */*",
  }
  if (rsshubToken) headers["X-RSSHub-Token"] = rsshubToken
  // ...原有逻辑不变
}
```

---

## 六、IPC 接口

> [!IMPORTANT]
> `getRsshubStatus` **不返回 token**，token 仅在主进程内部流转，不通过 IPC 暴露到渲染层。

在 `DbService` 新增：

```typescript
@IpcMethod()
async getRsshubStatus(_ctx: IpcContext) {
  const { status, port } = rsshubManager.getState()
  return { status, port }  // token 不返回渲染层
}

@IpcMethod()
async toggleRsshub(_ctx: IpcContext, enabled: boolean) {
  return enabled ? rsshubManager.start() : rsshubManager.stop()
}

@IpcMethod()
async restartRsshub(_ctx: IpcContext) {
  return rsshubManager.restart()
}
```

同步修正 `getState()` 返回类型：

```typescript
getState(): Pick<RsshubManagerState, "status" | "port">  // 移除 token
```

---

## 七、安全边界与资源控制

| 措施           | 实现                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| **随机 Token** | `crypto.randomBytes(32).toString('hex')`，注入子进程环境变量，请求头校验，不匹配返回 403 |
| **仅本机访问** | 绑定 `127.0.0.1`，禁止 `0.0.0.0`                                                         |
| **请求超时**   | 本地 RSSHub 请求 20s 超时                                                                |
| **并发上限**   | 子进程最大 8 个并发请求                                                                  |
| **Token 轮换** | 每次重启生成新 Token，旧 Token 失效                                                      |
| **日志轮转**   | 单文件 10MB，保留最近 5 个                                                               |
| **缓存上限**   | 500MB，超限 LRU 淘汰（用户可配置）                                                       |

---

## 八、设置 UI（最小可用）

```
┌──────────────────────────────────────────┐
│ 内置 RSSHub                         [开] │
│ 为 rsshub.app 路由提供本地服务            │
│ 状态：● 运行中（port: 51423）            │
├──────────────────────────────────────────┤
│ 自定义 RSSHub 实例（可选）               │
│ [_____________________________________]  │
│ 留空则使用内置实例                        │
└──────────────────────────────────────────┘

异常时：
│ 状态：⚠ 冷却中（已重试 3 次，5 分钟后自动重试）│
│                           [立即重启]     │
```

诊断信息展示：当前端口、重试次数、最近错误摘要。

---

## 九、三平台兼容性

| 问题                 |                macOS                 |          Windows          |  Linux  |
| -------------------- | :----------------------------------: | :-----------------------: | :-----: |
| `fork()` 运行时      | Electron 内置 Node，无需系统 Node ✅ |          同左 ✅          | 同左 ✅ |
| `extraResource` 路径 |  `process.resourcesPath/rsshub/` ✅  | `path.join` 自动分隔符 ✅ | 同左 ✅ |
| 端口冲突             |        portfinder 自动避让 ✅        |          同左 ✅          | 同左 ✅ |
| 防火墙 localhost     |                无 ✅                 |   Defender 可能弹框 ⚠️    |  无 ✅  |

**Windows**：绑定 `127.0.0.1` 可大概率避免防火墙弹框；若仍弹框，安装器预注册防火墙例外。

---

## 十、RSSHub 精简打包

**构建脚本**：`scripts/build-rsshub.ts`

```
1. npm install rsshub@<pinned>
2. esbuild 按 BUNDLED_ROUTES 白名单 tree-shake
3. 输出 resources/rsshub/index.js（目标 < 30MB）
4. 生成 routes-manifest.json（路由列表+版本）
```

**路由白名单**（`scripts/rsshub-routes.ts`）：

```typescript
export const BUNDLED_ROUTES = [
  "github",
  "bilibili",
  "weibo",
  "zhihu",
  "sspai",
  "v2ex",
  "hackernews",
  "reddit",
  "youtube",
  "telegram",
  // ...共 30 个
]
```

---

## 十一、关键时序

### 11.1 正常订阅时序

```
Renderer
  → IPC: db.previewFeed("https://rsshub.app/github/trending")
    → DbService.resolveRsshubUrl(url)
      → RsshubManager.ensureRunning()  // 幂等，已运行直接返回 port
      → 改写: http://127.0.0.1:<port>/github/trending
    → fetchUrl(localUrl, token)
      → RSSHub 子进程处理并返回 XML
    → parseRssFeed(xml) → 入库 → 返回渲染层
```

### 11.2 异常恢复时序

```
子进程 exit 事件
  → RsshubManager.onCrash()
    → retryCount < 3: 退避重试（1s/2s/4s）
        → fork() + healthCheck
        → 成功: status = "running"
        → 失败: retryCount++
    → retryCount >= 3: status = "cooldown"（5 分钟）
        → IPC push: 渲染层显示"点击重启"
        → 冷却期满: 自动触发 1 次重试
        → 用户点击: 立即触发重试
```

---

## 十二、可观测性

主进程日志字段（结构化日志，便于调试）：

| 字段                   | 说明                                                |
| ---------------------- | --------------------------------------------------- |
| `rsshub.status`        | 当前状态（stopped/starting/running/error/cooldown） |
| `rsshub.port`          | 当前监听端口                                        |
| `rsshub.retryCount`    | 当前重试次数                                        |
| `rsshub.lastError`     | 最近一次错误摘要                                    |
| `rsshub.cooldownUntil` | 冷却期结束时间戳（cooldown 态时）                   |

设置页诊断面板展示：`status`、`port`、`retryCount`、`lastError`。

---

## 十三、决策记录（待补）

- [ ] **Node 运行时方案**：`fork()` vs `spawn(ELECTRON_RUN_AS_NODE=1)` — POC 实验后定型
- [ ] **Top 路由白名单 v1 列表**：确认 30 个路由的最终名单
- [ ] **资源配额默认值**：并发 8、超时 20s、缓存 500MB — 是否需要用户可调
- [ ] **Windows 防火墙**：127.0.0.1 绑定是否足够，还是需要安装器预注册例外
