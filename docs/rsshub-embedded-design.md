# FreeFolo 内嵌 RSSHub 方案设计

> 最后更新：2026-02-28（与当前实现对齐）
> 关联上下文：`AI-CONTEXT.md`

---

## 一、目标与范围

### 1.1 问题

rsshub.app 公共实例对 RSS 阅读器客户端 **HTTP 403 限流封禁**，用户需要自建才能正常使用 RSSHub 路由。

### 1.2 目标

在 FreeFolo 内部静默运行一个最小化 RSSHub 实例，让用户**零配置**使用 RSSHub 的所有路由，输入 `https://rsshub.app/xxx` 或 `rsshub://xxx` 格式 URL 即可直接订阅。

### 1.3 非目标（V1 不做）

- Lite 模式不保证"全部 1000+ 路由"首版均可用，仅内置常用路由白名单
- 不实现远程插件动态安装路由
- 不引入云端同步或远端配置中心

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│                  FreeFolo Electron                   │
│                                                      │
│  ┌─────────────┐         ┌──────────────────────┐   │
│  │  渲染层      │ IPC     │      主进程           │   │
│  │  订阅表单    │────────▶│  RsshubManager       │   │
│  │  URL 输入    │         │  (子进程生命周期管理) │   │
│  └─────────────┘         └──────────┬───────────┘   │
│                                     │ fork()         │
│                           ┌─────────▼──────────┐    │
│                           │  RSSHub 子进程      │    │
│                           │  127.0.0.1:随机端口 │    │
│                           │  (resources/rsshub) │    │
│                           └────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

**核心机制**：

- 默认使用 `spawn(process.execPath, ...) + ELECTRON_RUN_AS_NODE=1` 启动 RSSHub；保留 `fork()` 兼容路径
- 复用 Electron 内置 Node.js 运行时，无需目标机器安装 Node
- 子进程崩溃不影响 FreeFolo 主进程，指数退避自动重启
- 主进程截获包含 `rsshub.app` 域名或 `rsshub://` 协议的 URL，透明转发到本地子进程

---

## 三、打包策略（关键决策）

### 3.1 体积问题分析

| 方案                   | 包含内容                 | 估算体积           |
| ---------------------- | ------------------------ | ------------------ |
| 全量 RSSHub            | 1000+ 路由 + 全部依赖    | ~500MB（不可接受） |
| **按需精简**（本方案） | 核心框架 + Top 路由      | **~30–60MB**       |
| 极简模式               | 仅路由框架，路由远程加载 | ~5MB（但需联网）   |

### 3.2 双模式策略

- Lite：构建时按白名单打包，未实现路由返回明确错误
- Official：本地内嵌官方运行时，全量执行链路（仍受上游路由可用性影响）

构建时仍会产出路由清单，用于 Lite 模式能力展示。

**默认内置路由（Top 30 常用，可配置）**：

```
github          - GitHub 相关
twitter/x       - Twitter/X
youtube         - YouTube
bilibili        - BiliBili
weibo           - 微博
zhihu           - 知乎
sspai           - 少数派
v2ex            - V2EX
hackernews      - HackerNews
reddit          - Reddit
telegram        - Telegram 频道
rssblog         - RSS 博客聚合
...（共 30 个）
```

### 3.3 资源路径策略（统一方案）

> [!IMPORTANT]
> **统一采用 `extraResource` 方案**，不使用 `asar.unpack`。两者运行时路径不同，混用会导致路径混乱，必须二选一。

运行时获取路径：

```typescript
// 开发环境
const rsshubDir = path.join(app.getAppPath(), "resources/rsshub")
// 生产环境（extraResource 放到 process.resourcesPath）
const rsshubDir = path.join(process.resourcesPath, "rsshub")
const rsshubBundlePath = path.join(rsshubDir, "index.js")
```

`forge.config.cts` **只改 extraResource，asar 配置保持原样**：

```typescript
packagerConfig: {
  extraResource: [
    "./resources/app-update.yml",
    "./resources/rsshub",  // 新增
  ],
  asar: {
    unpack: "**/*.node",  // 保持原样，不加 rsshub 相关规则
  },
}
```

---

## 四、子进程生命周期管理

### 4.1 新增模块：`RsshubManager`

文件：`apps/desktop/layer/main/src/manager/rsshub.ts`

```typescript
interface RsshubManagerState {
  process: ChildProcess | null
  port: number | null
  token: string | null // 随机访问 token，每次重启刷新
  status: "stopped" | "starting" | "running" | "error" | "cooldown"
  retryCount: number
  cooldownUntil: number | null // timestamp，冷却期结束时间
}
```

**状态机转换**：

```
stopped → starting → running
                   ↘ error → (指数退避重试)
                              → running（恢复）
                              → cooldown（3 次失败后，冷却 5 分钟）
cooldown → starting（用户手动点击"立即重试"或冷却期满自动触发一次）
```

> `cooldown` 期间禁止自动重试，防止持续崩溃耗尽资源，仅允许用户手动触发。

### 4.2 生命周期

```
应用启动
  └─ 用户开启内置 RSSHub（默认开启）
      └─ portfinder 获取可用端口
      └─ token = crypto.randomBytes(32).toString('hex')
      └─ child_process.fork(rsshubBundlePath, [], {
           env: { PORT, NODE_ENV, RSSHUB_TOKEN: token }
         })
      └─ 健康探针：轮询 GET /healthz（携带 token）
           每 500ms 一次，最多等 10s
           → 返回 200: status = "running"
           → 超时 10s: status = "error"

应用退出（app.on("before-quit")）
  └─ process.kill()，等待 exit 事件，超时 3s 强杀

子进程崩溃（process.on("exit")）
  └─ 指数退避重启：1s → 2s → 4s（最多 3 次）
  └─ 3 次失败后 → status = "cooldown"，冷却 5 分钟
  └─ IPC 推送渲染层：显示"内置 RSSHub 异常，点击重启"按钮
  └─ 冷却期满自动尝试一次；或用户手动点击立即重试
```

### 4.3 关键接口

```typescript
class RsshubManager {
  private state: RsshubManagerState

  async start(): Promise<{ port: number; token: string }>
  async stop(): Promise<void>
  getState(): Pick<RsshubManagerState, "status" | "port" | "token">
  async restart(): Promise<void> // 供渲染层手动触发
  private healthCheck(port: number, token: string): Promise<boolean>
  private scheduleRetry(): void // 指数退避
}

export const rsshubManager = new RsshubManager()
```

### 4.4 TODO：Node 运行时方案实验（fork/spawn 二选一验证）

> [!TODO]
> 目标：验证“无需系统 Node”是否成立，避免实现阶段运行时不一致。

- 实验 A（推荐优先）：
  - `child_process.spawn(process.execPath, [rsshubBundlePath], { env: { ELECTRON_RUN_AS_NODE: "1" } })`
  - 预期：在无系统 `node` 命令环境下仍可拉起 RSSHub，并通过健康探针。
- 实验 B（对照）：
  - `child_process.fork(rsshubBundlePath, [], { env })`
  - 预期：与实验 A 对比启动成功率、稳定性、日志可观测性。

验收标准：

- 在“移除系统 Node 可执行文件”的测试环境中，至少一种方案可稳定启动并连续运行 30 分钟。
- `db.previewFeed` 对 RSSHub 路由请求成功率 >= 99%（样本 200 次）。
- 异常重启流程（指数退避）可按预期触发，且不会影响主进程可用性。

---

## 五、URL 路由拦截

### 5.1 识别规则

| 条件                   | 示例                                             |
| ---------------------- | ------------------------------------------------ |
| 域名为 `rsshub.app`    | `https://rsshub.app/github/trending?language=js` |
| 协议为 `rsshub://`     | `rsshub://github/trending?language=js`           |
| 域名匹配用户自定义实例 | 设置中配置                                       |

### 5.2 拦截逻辑（保留 query + hash，服务不可用时明确报错）

```typescript
// apps/desktop/layer/main/src/ipc/services/db.ts

function resolveRsshubUrl(url: string): { resolvedUrl: string; token: string | null } {
  let isRsshubUrl = false
  let resolvedPath = ""

  try {
    const parsed = new URL(url)

    if (parsed.hostname === "rsshub.app") {
      isRsshubUrl = true
      // 保留 pathname + search + hash，不丢参数
      resolvedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`
    } else if (parsed.protocol === "rsshub:") {
      isRsshubUrl = true
      // rsshub://namespace/route?a=1 → /namespace/route?a=1
      resolvedPath = `/${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    /* 非合法 URL，原样返回 */
  }

  if (!isRsshubUrl) return { resolvedUrl: url, token: null }

  const { status, port, token } = rsshubManager.getState()

  // 是 RSSHub URL 但内置服务不可用：明确报错，不静默回退 rsshub.app
  if (status !== "running" || !port) {
    throw new Error(
      `内置 RSSHub 当前未运行（状态: ${status}）。` +
        `请在 设置 → 订阅源 中启动内置 RSSHub，或配置自定义实例。`,
    )
  }

  return {
    resolvedUrl: `http://127.0.0.1:${port}${resolvedPath}`,
    token,
  }
}

// fetchUrl 调用时注入 token
const { resolvedUrl, token } = resolveRsshubUrl(feedUrl)
const xmlText = await fetchUrl(resolvedUrl, token)

// fetchUrl 签名扩展：
function fetchUrl(url: string, rsshubToken?: string | null, redirectCount = 0): Promise<string> {
  const headers: Record<string, string> = { "User-Agent": "FreeFolo RSS Reader/1.0" }
  if (rsshubToken) headers["X-RSSHub-Token"] = rsshubToken
  // ...原有逻辑
}
```

---

## 六、IPC 接口扩展

```typescript
@IpcMethod()
async getRsshubStatus(_context: IpcContext) {
  return rsshubManager.getState()  // { status, port, token }
}

@IpcMethod()
async toggleRsshub(_context: IpcContext, enabled: boolean) {
  if (enabled) {
    return rsshubManager.start()
  } else {
    return rsshubManager.stop()
  }
}

@IpcMethod()
async restartRsshub(_context: IpcContext) {
  return rsshubManager.restart()
}
```

---

## 七、设置 UI

```
┌─────────────────────────────────────────┐
│ 内置 RSSHub                        [开] │
│ 为 rsshub.app 路由提供本地支持          │
│ 状态：● 运行中 (port: 51423)           │
├─────────────────────────────────────────┤
│ 自定义 RSSHub 实例（可选）              │
│ [________________________________]      │
│ 留空则使用内置实例                       │
└─────────────────────────────────────────┘

异常状态显示：
│ 状态：⚠ 启动失败（已重试 4 次）         │
│                         [点击重启]      │
```

---

## 八、RSSHub 精简打包方案

### 8.1 构建流程

新增 `scripts/build-rsshub.ts`：

1. 以 npm 包形式安装指定版本 RSSHub 源码
2. 通过 **esbuild** 按路由白名单 tree-shaking，只打包指定路由
3. 输出单文件 `index.js`（目标 < 30MB）
4. 输出到 `apps/desktop/resources/rsshub/index.js`

### 8.2 路由白名单

```typescript
// scripts/rsshub-routes.ts
export const BUNDLED_ROUTES = [
  "github",
  "bilibili",
  "weibo",
  // ... Top 30
]
```

---

## 九、安全边界与资源控制

内置 RSSHub 仅供 FreeFolo 主进程访问，需防止本机其他进程通过端口探测滥用：

| 措施             | 实现                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **随机 Token**   | 启动时 `crypto.randomBytes(32).toString('hex')`，注入子进程环境变量；主进程请求头携带 `X-RSSHub-Token`；子进程中间件校验，不匹配返回 403 |
| **仅本机访问**   | 子进程绑定 `127.0.0.1`，不绑定 `0.0.0.0`                                                                                                 |
| **请求超时**     | `fetchUrl` 对本地 RSSHub 请求设置 20s 超时                                                                                               |
| **并发上限**     | 子进程限制同时处理 8 个并发请求                                                                                                          |
| **Token 轮换**   | 每次子进程重启生成新 Token，旧 Token 自动失效                                                                                            |
| **日志轮转**     | 单文件上限 10MB，保留最近 5 个文件，防止磁盘无限增长                                                                                     |
| **缓存目录上限** | RSSHub 本地缓存上限 500MB（用户可配置），超限 LRU 淘汰                                                                                   |

---

## 十、三平台兼容性

| 问题                          |                      macOS                       |               Windows                |   Linux   |
| ----------------------------- | :----------------------------------------------: | :----------------------------------: | :-------: |
| `child_process.fork()` 运行时 | 使用 Electron 内置 Node.js，**无需系统 Node** ✅ |               同左 ✅                |  同左 ✅  |
| 资源路径（extraResource）     |        `process.resourcesPath/rsshub/` ✅        | 同左（`path.join` 自动处理分隔符）✅ |  同左 ✅  |
| 随机端口冲突                  |         极低概率，portfinder 自动避让 ✅         |               同左 ✅                |  同左 ✅  |
| 防火墙拦截 localhost          |                    不存在 ✅                     |     Windows Defender 可能弹框 ⚠️     | 不存在 ✅ |

> [!NOTE]
> 使用 `child_process.fork()` 而非 `spawn("node", ...)`：`fork()` 复用 Electron 进程内置的 Node.js 运行时，**不依赖目标机器安装的系统 Node**，三平台行为一致。

**Windows 特殊处理**：

- 绑定 `127.0.0.1` 而非 `0.0.0.0`（仅本地回环，不触发防火墙弹框）
- 如仍弹框，在安装器中预注册防火墙例外规则

---

## 十一、风险评估

| 风险                           |      概率      | 影响 | 缓解措施                                      |
| ------------------------------ | :------------: | :--: | --------------------------------------------- |
| 体积超预期（>100MB）           |       中       |  高  | 先 POC 验证，超预期走方案 D（运行时下载）     |
| RSSHub 子进程持续崩溃          |       低       |  中  | 指数退避 4 次后 UI 提示，不影响非 RSSHub 订阅 |
| 端口冲突                       |      极低      |  低  | portfinder 自动寻找可用端口                   |
| RSSHub 版本更新导致路由失效    |       中       |  低  | 锁定版本号，随应用版本一起升级                |
| 某些路由需要第三方 Cookie/登录 | 高（部分路由） |  低  | 与外部实例一致，需用户自行配置                |
| Windows Defender 拦截          |       低       |  中  | 绑定 127.0.0.1；安装器预注册防火墙例外        |

---

## 十二、开发路线图

| 阶段    | 内容                                                                                     | 预估工时 |
| ------- | ---------------------------------------------------------------------------------------- | -------- |
| **POC** | esbuild 按需打包 Top 10 路由，产出体积数据；验证 fork() 在 Electron 中运行 RSSHub 可行性 | 0.5 天   |
| **P0**  | `RsshubManager`（fork/健康探针/指数退避/token）                                          | 1 天     |
| **P1**  | `resolveRsshubUrl` 改写（保留 query/hash，明确错误）+ `fetchUrl` token 注入              | 0.5 天   |
| **P2**  | IPC 接口 + 设置 UI（开关/状态/重启按钮）                                                 | 1 天     |
| **P3**  | `build-rsshub.ts` + forge.config extraResource 集成                                      | 1 天     |
| **P4**  | 三平台测试 + Windows 防火墙 + 安全审计                                                   | 1 天     |

**总计**：~4.5 天（POC 体积结果决定是否继续）

---

## 十三、关键前置验证（POC）

> [!CAUTION]
> **满足以下全部 3 条才进入 P0 实装，否则回退到方案 D。**

| #   | 验收项     | 通过条件                                                                                                 |
| --- | ---------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **体积**   | esbuild 按需打包 Top 10 路由，bundle < 30MB                                                              |
| 2   | **运行**   | Electron 环境下 `fork()` / `spawn(ELECTRON_RUN_AS_NODE=1)` 至少一种可正常响应 `/healthz` 和 RSS 路由请求 |
| 3   | **稳定性** | 模拟崩溃后指数退避+cooldown 流程正常触发，主进程不受影响；200 次连续请求成功率 ≥ 99%                     |

POC 约需 **半天**，三条全过才进入 P0 实装。

---

## 十四、替代兜底方案（方案 D）

如果 POC 发现体积 > 100MB，退化到：

**运行时下载 RSSHub**

- 应用首次使用 RSSHub 功能时，后台下载精简 bundle 到 `app.getPath("userData")/rsshub/`
- 优点：不影响安装包体积
- 缺点：首次使用需联网；需设计下载进度 UI + 完整性校验（SHA256）

POC 后根据体积数据决策。

---

## 十五、测试规范

### 15.1 单元测试

- URL 改写：`rsshub.app` / `rsshub://` / 含 query+hash / 不命中场景（4 个用例）
- 状态机迁移：`stopped → starting → running → error → cooldown → starting`
- 错误码校验：服务不可用时抛出含 `RSSHUB_LOCAL_UNAVAILABLE` 的结构化错误

### 15.2 集成测试

- 主进程成功拉起 RSSHub 子进程并通过健康探针进入 `running`
- `db.previewFeed` 命中本地 RSSHub 正确返回 XML
- 关停 RSSHub 后订阅操作提示明确错误，不出现泛化"获取订阅源出错"

### 15.3 人工回归

- 编辑/取消订阅不受 RSSHub 进程波动影响
- 应用退出后子进程不残留（`ps aux | grep rsshub` 无输出）
- `cooldown` 状态 UI 正确显示，手动重启按钮可用且触发后状态恢复正常
