# FreeFolo 多设备同步功能 — 技术设计文档

> **方案基础**：增量 Oplog + Git 私有仓库（详细原理见 [sync-design.md](./sync-design.md)）  
> **文档版本**：v1.0  
> **最后更新**：2026-02-28

---

## 一、总体架构

```
┌────────────────────────────────────────────────────────────────────┐
│                   FreeFolo Desktop (Electron)                       │
│                                                                     │
│  ┌──────────────┐   SyncOp 事件   ┌────────────────────────────┐   │
│  │  DB Services │ ─────────────► │      SyncLogger             │   │
│  │  (entry/sub/ │                │  (拦截写操作，生成 SyncOp)    │   │
│  │   collection)│                └────────────┬───────────────┘   │
│  └──────────────┘                             │ ops[]              │
│                                               ▼                    │
│  ┌──────────────┐   IPC 调用     ┌────────────────────────────┐   │
│  │  Renderer    │ ─────────────► │      SyncService (IPC)     │   │
│  │  (设置页/状态)│                │  exportState / importState │   │
│  └──────────────┘                │  gitSync / getStatus       │   │
│                                  └────────────┬───────────────┘   │
│                                               │                    │
│                                               ▼                    │
│                          ┌────────────────────────────────────┐   │
│                          │         SyncManager (单例)          │   │
│                          │  - deviceId / logicalClock 管理     │   │
│                          │  - exportState()                   │   │
│                          │  - importState()                   │   │
│                          │  - compactSnapshot()               │   │
│                          │  - 定时器 (10min flush)            │   │
│                          └────────────┬───────────────────────┘   │
│                                       │                            │
│                                       ▼                            │
│                          ┌────────────────────────────────────┐   │
│                          │         GitRunner                   │   │
│                          │  pull --rebase / add / commit / push│   │
│                          └────────────────────────────────────┘   │
│                                       │                            │
└───────────────────────────────────────┼────────────────────────────┘
                                        │ SSH / HTTPS
                                        ▼
                             ┌──────────────────────┐
                             │  freefolo-sync (Git)  │
                             │  Private Repository   │
                             └──────────────────────┘
```

---

## 二、新增文件说明

### 主进程层（`apps/desktop/layer/main/src/`）

```
manager/
├── sync.ts                    ← SyncManager 单例（核心业务逻辑）
├── sync-git.ts                ← GitRunner（git 命令封装）
├── sync-logger.ts             ← SyncLogger（DB 写操作拦截器）
├── sync-export.ts             ← exportState() 实现
├── sync-import.ts             ← importState() 实现
└── sync-snapshot.ts           ← compactSnapshot() / importFromSnapshot()

ipc/services/
└── sync.ts                    ← SyncService（IPC 接口层）
```

### 数据库层（`packages/internal/database/src/`）

```
schemas/index.ts               ← 新增 2 张同步辅助表（追加到末尾）
drizzle/                       ← 新增对应 migration 文件
```

### 渲染层（`apps/desktop/layer/renderer/src/`）

```
modules/settings/              ← 同步设置页
  SyncSettings.tsx             ← 配置 Git 仓库路径、状态展示、手动触发
```

---

## 三、数据库新增表（Migration）

### 3.1 `applied_sync_ops` — 幂等去重

```sql
CREATE TABLE IF NOT EXISTS applied_sync_ops (
  op_id      TEXT    PRIMARY KEY,
  applied_at INTEGER NOT NULL   -- Unix ms
);
```

**用途**：importState 前先查此表，已存在的 opId 跳过，保证重复导入幂等。

### 3.2 `pending_sync_ops` — 孤儿 Op 暂存

```sql
CREATE TABLE IF NOT EXISTS pending_sync_ops (
  op_id       TEXT    PRIMARY KEY,
  op_json     TEXT    NOT NULL,         -- 完整 SyncOp JSON 字符串
  retry_after INTEGER NOT NULL DEFAULT 0, -- Unix ms，0=立即重试
  created_at  INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'  -- 'pending' | 'expired'
);
CREATE INDEX IF NOT EXISTS idx_pending_ops_retry ON pending_sync_ops(retry_after);
```

**用途**：回放时对应 entryId 在本地不存在时入此表，每次 feed 刷新后尝试重放。

---

## 四、核心类型定义

> 文件：`apps/desktop/layer/main/src/manager/sync.ts`

```typescript
// ===== SyncOp 核心类型 =====

export type OpType =
  | "entry.mark_read"
  | "entry.mark_unread"
  | "collection.add"
  | "collection.remove"
  | "subscription.add"
  | "subscription.remove"
  | "subscription.update"

export interface SyncOp {
  opId: string          // UUID v4，幂等键
  deviceId: string      // 设备唯一 ID
  logicalClock: number  // 单设备递增（Lamport Clock），用于排序
  ts: number            // wall clock ms，仅用于 LWW 决策
  type: OpType
  entityType: "entry" | "feed" | "subscription" | "collection"
  entityId: string
  payload?: Record<string, unknown>
}

// ===== Payload 类型 =====

export interface CollectionAddPayload {
  feedId: string
  view: number
}

export interface SubscriptionAddPayload {
  feedId: string
  feedUrl: string
  view: number
  category?: string
  title?: string
}

export interface SubscriptionUpdatePayload {
  category?: string
  title?: string
  view?: number
}

// ===== sync-meta.json 结构 =====

export interface SyncMeta {
  schemaVersion: number
  entryIdAlgoVersion: number
  devices: Record<string, {
    name: string
    registeredAt: number
    lastSyncAt: number
  }>
}

// ===== 本地持久化水位线（app userData/sync-meta.json）=====

export interface LocalSyncMeta {
  deviceId: string
  deviceName: string        // 系统主机名
  logicalClock: number      // 上次 export 后的水位线
  syncRepoPath: string | null  // 用户配置的 Git 仓库本地路径
  lastExportAt: number | null
  lastImportAt: number | null
}
```

---

## 五、SyncManager 详细设计

> 文件：`apps/desktop/layer/main/src/manager/sync.ts`

### 5.1 状态与初始化

```typescript
class SyncManagerStatic {
  private localMeta: LocalSyncMeta | null = null
  private flushTimer: NodeJS.Timeout | null = null
  private readonly FLUSH_INTERVAL_MS = 10 * 60 * 1000  // 10 分钟

  async init(): Promise<void>
  // 1. 读取 app.getPath("userData")/sync-local-meta.json
  // 2. 若不存在，生成新 deviceId（crypto.randomUUID()），写入文件
  // 3. 若 syncRepoPath 已配置，启动定时 flush 计时器

  getDeviceId(): string
  getLocalMeta(): LocalSyncMeta
  updateSyncRepoPath(path: string): Promise<void>
  // 更新 syncRepoPath，重置定时器
}
```

### 5.2 export-state 流程

```
exportState(fromLogicalClock: number) {
  1. 从 applied_sync_ops 表拉取已记录的所有 opId（构建 Set）
  2. 从 SyncLogger 内存队列读取所有 clock > fromLogicalClock 的 SyncOp
     ※ SyncLogger 队列在 import 时不会生成新 op，避免回放风暴
  3. 过滤掉已在 applied_sync_ops 中的 opId（防止重复 export）
  4. 按 logicalClock 升序排列
  5. 追加写入 {syncRepoPath}/ops/YYYY-MM-DD/{deviceId}.ndjson
  6. 末行 JSON.parse 校验完整性
  7. 更新 localMeta.logicalClock = 最新水位线
  8. 返回 { exportedCount, newLogicalClock }
}
```

### 5.3 import-state 流程

```
importState() {
  1. 扫描 {syncRepoPath}/ops/ 下所有 ndjson 文件
     - 跳过 {deviceId}.ndjson（自己的文件）
     - 跳过 ops/archive/ 目录（已归档，不参与增量 import）
  2. 读取所有 SyncOp，按 (logicalClock, ts, deviceId) 升序排列
  3. 查询 applied_sync_ops 构建已应用 Set
  4. 逐条处理:
     a. 若 opId 在 applied_sync_ops 中 → 跳过
     b. 执行 applyOp(op):
        - entry.mark_read/unread → EntryService.patchMany()
        - collection.add → CollectionsService.upsert()
        - collection.remove → CollectionsService.delete()
        - subscription.add → FeedService.upsert() + SubscriptionService.upsertMany()
        - subscription.remove → SubscriptionService.deleteByTargets()
        - subscription.update → SubscriptionService.patch()
        成功 → INSERT INTO applied_sync_ops
        失败（entityId 不存在）→ INSERT INTO pending_sync_ops
  5. 写入 localMeta.lastImportAt
  6. 返回 { appliedCount, pendingCount }
}
```

### 5.4 LWW 冲突解决

> 多设备同时操作同一实体时，不靠 Git 行级合并（ndjson 每行独立无冲突），而是在 `applyOp` 阶段按以下规则裁决：

| 操作对 | 决策规则 |
|-------|---------|
| `entry.mark_read` vs `entry.mark_unread` | 取 `ts` 最大值；相同 ts 则 `read=true` 优先 |
| `collection.add` vs `collection.remove` | 取 `ts` 最大值；相同 ts 则 `add` 优先 |
| `subscription.update` | 每字段独立 LWW，不整体覆盖 |
| `subscription.add` vs `subscription.remove` | 取 `logicalClock + ts` 最大值 |

**实现方案**：`applyOp` 前先查 `applied_sync_ops` 中对同一 `entityId` 最近的反向 op，若存在且对方 ts 更新，则放弃本次应用。

---

## 六、GitRunner 设计

> 文件：`apps/desktop/layer/main/src/manager/sync-git.ts`

```typescript
export class GitRunner {
  constructor(private repoPath: string) {}

  // 执行 git 命令，返回 stdout
  private async run(args: string[]): Promise<string>

  async pull(): Promise<void>
  // git pull --rebase origin main
  // 失败时抛出结构化错误

  async add(filePattern: string): Promise<void>
  // git add {filePattern}

  async commit(message: string): Promise<boolean>
  // git commit -m {message}
  // 若无变更返回 false（不报错）

  async push(): Promise<void>
  // git push origin main
  // 若失败（冲突），先 pull --rebase 再重试一次

  async syncCycle(): Promise<SyncCycleResult>
  // 完整同步周期：pull → importState → exportState → add → commit → push
}

export interface SyncCycleResult {
  pullOk: boolean
  importedCount: number
  exportedCount: number
  committed: boolean
  pushed: boolean
  errors: string[]
}
```

---

## 七、SyncLogger（DB 写操作钩子）

> 文件：`apps/desktop/layer/main/src/manager/sync-logger.ts`

**设计思路**：不修改 Service 层代码，在 IPC 调用层（`DbService`）和渲染层状态变更调用点插入钩子，产生 SyncOp 压入内存队列。

### 7.1 内存队列

```typescript
class SyncLogger {
  private ops: SyncOp[] = []
  private logicalClock = 0  // 从 localMeta 初始化

  /** 外部调用：记录一条操作 */
  record(op: Omit<SyncOp, "opId" | "deviceId" | "logicalClock" | "ts">): void
  // - 自增 logicalClock
  // - 填入 opId（randomUUID）、deviceId、ts（Date.now()）
  // - 压入 this.ops

  /** exportState 调用：获取并清空队列 */
  drain(fromClock: number): SyncOp[]

  /** importState 调用时暂停记录，防止回放产生新 op */
  pause(): void
  resume(): void
}
```

### 7.2 钩子插入点

以下调用点在 **主进程 IPC 服务** 或 **渲染层 store action** 中插入 `syncLogger.record()`：

| 触发点 | 文件 | 生成 OpType |
|-------|------|------------|
| `DbService.updateReadStatus()` | `ipc/services/db.ts` | `entry.mark_read` / `entry.mark_unread` |
| `DbService.addFeed()` | `ipc/services/db.ts` | `subscription.add` |
| `DbService.deleteSubscriptionByTargets()` | `ipc/services/db.ts` | `subscription.remove` |
| `SubscriptionService.patch()` 包装 | `ipc/services/sync.ts` | `subscription.update` |
| Collection add/remove IPC | 待确认位置 | `collection.add` / `collection.remove` |

> ⚠️ importState 执行期间，SyncLogger 处于 `paused` 状态，回放的 DB 写操作不生成新 SyncOp。

---

## 八、SyncService（IPC 层）

> 文件：`apps/desktop/layer/main/src/ipc/services/sync.ts`

```typescript
@IpcService()
export class SyncService extends IpcService {
  static override readonly groupName = "sync"

  @IpcMethod()
  async getStatus(_ctx: IpcContext): Promise<SyncStatus>
  // 返回: { deviceId, syncRepoPath, lastExportAt, lastImportAt,
  //          gitStatus: "idle"|"syncing"|"error", lastError? }

  @IpcMethod()
  async setSyncRepoPath(_ctx: IpcContext, path: string): Promise<void>

  @IpcMethod()
  async exportState(_ctx: IpcContext): Promise<{ exportedCount: number }>

  @IpcMethod()
  async importState(_ctx: IpcContext): Promise<{ appliedCount: number; pendingCount: number }>

  @IpcMethod()
  async gitSync(_ctx: IpcContext): Promise<SyncCycleResult>
  // 手动触发完整同步周期

  @IpcMethod()
  async compactSnapshot(_ctx: IpcContext): Promise<{ entriesCount: number }>
  // 生成全量快照
}
```

---

## 九、Bootstrap 集成

> 修改文件：`apps/desktop/layer/main/src/manager/bootstrap.ts`

### 9.1 启动时（`app.whenReady()`）

```typescript
// 在 WindowManager.getMainWindowOrCreate() 之前
await SyncManager.init()

if (SyncManager.hasSyncRepo()) {
  try {
    await SyncManager.gitRunner.pull()
    await SyncManager.importState()
  } catch (err) {
    logger.warn("[Sync] 启动同步失败，继续启动", err)
    // 不阻塞启动
  }
}
```

### 9.2 退出时（`before-quit`）

```typescript
// 在 rsshubManager.stop() 之后、session flush 之前
if (SyncManager.hasSyncRepo()) {
  try {
    await SyncManager.exportState()
    await SyncManager.gitRunner.add("ops/")
    await SyncManager.gitRunner.commit(`sync: ${SyncManager.getDeviceId()} ${Date.now()}`)
    await SyncManager.gitRunner.push()
  } catch (err) {
    logger.warn("[Sync] 退出同步失败", err)
    // 不阻塞退出
  }
}
```

### 9.3 定时 Flush（10 分钟）

```typescript
// SyncManager.init() 内部启动
setInterval(async () => {
  if (!SyncManager.hasSyncRepo()) return
  try {
    await SyncManager.exportState()
    await SyncManager.gitRunner.add("ops/")
    const committed = await SyncManager.gitRunner.commit(`sync-auto: ${Date.now()}`)
    if (committed) await SyncManager.gitRunner.push()
  } catch (err) {
    logger.warn("[Sync] 定时同步失败", err)
  }
}, FLUSH_INTERVAL_MS)
```

---

## 十、Feed 刷新后触发 drainPendingOps

> 修改文件：`apps/desktop/layer/main/src/ipc/services/db.ts`

```typescript
// refreshFeed 末尾插入
await SyncManager.drainPendingOps(feedId)
```

`drainPendingOps(feedId)` 实现：
1. 查询 `pending_sync_ops` 中 `status='pending'` 且 `retry_after <= Date.now()` 的 ops
2. 筛选 `entityId` 在给定 feedId 下已存在的条目
3. 重新执行 `applyOp(op)` 成功 → 删除 pending 记录
4. `created_at < Date.now() - 90天` → 标记 `status='expired'`

---

## 十一、Wind-down（日志压缩）

| 阶段 | 触发时机 | 操作 |
|------|---------|------|
| 30 天归档 | 每次 exportState 或手动触发 | 将 30 天前的 `ops/YYYY-MM-DD/` 递归移入 `ops/archive/` |
| 快照压缩 | 手动触发 / 每季度 | `compactSnapshot()`：全量状态写 `snapshot/latest.json` |
| 新设备初始化 | 首次配置 syncRepoPath | 先加载 `snapshot/latest.json`，再回放 30 天内增量 |

---

## 十二、sync-meta.json（Git 仓库）

位于 `{syncRepoPath}/meta.json`，由 `SyncManager.init()` 写入或更新：

```json
{
  "schemaVersion": 1,
  "entryIdAlgoVersion": 1,
  "devices": {
    "<deviceId>": {
      "name": "MacBook Pro M4",
      "registeredAt": 1740628040000,
      "lastSyncAt": 1740628040000
    }
  }
}
```

---

## 十三、UI 设计（设置页）

> 新增于设置 → 数据控制 下方或独立"同步"分区

### 13.1 配置项

| 配置项 | 控件 | 说明 |
|-------|------|------|
| Git 仓库本地路径 | 路径输入框 + 文件夹选择按钮 | 必须已存在且已 `git init` |
| 当前设备名 | 只读文本 + 编辑按钮 | 用于 ndjson 文件命名 |
| 设备 ID | 只读文本（折叠） | 显示当前 deviceId |

### 13.2 状态展示

| 状态 | 显示内容 |
|-----|---------|
| 未配置 | "尚未配置同步仓库" + 配置按钮 |
| 同步中 | Loading 动画 + "正在同步..." |
| 上次同步成功 | "上次同步: 3 分钟前" + 手动触发按钮 |
| 同步失败 | 红色警告 + 错误信息折叠展示 |

### 13.3 操作按钮

- **立即同步**：触发 `sync.gitSync` IPC（完整同步周期）
- **仅导出**：触发 `sync.exportState` + git commit/push
- **仅导入**：触发 git pull + `sync.importState`
- **生成快照**：触发 `sync.compactSnapshot`

---

## 十四、错误码定义

| 错误码 | 含义 | 处理方式 |
|-------|------|---------|
| `SYNC_REPO_NOT_CONFIGURED` | 仓库路径未配置 | 引导用户配置 |
| `SYNC_REPO_NOT_GIT` | 路径不是 git 仓库 | 提示运行 `git init` |
| `SYNC_GIT_PULL_CONFLICT` | pull rebase 冲突 | 重试一次，仍失败则报错 |
| `SYNC_GIT_PUSH_REJECTED` | push 被拒绝 | pull rebase 后重试 |
| `SYNC_NDJSON_CORRUPT` | ndjson 末行残缺 | 截断修复，记录告警 |
| `SYNC_CLOCK_DRIFT` | ts 与 logicalClock 偏差 > 阈值 | 记录警告，不阻塞 |
| `SYNC_ENTRY_ID_ALGO_MISMATCH` | meta.json 算法版本不一致 | 强提示，需要迁移脚本 |

---

## 十五、entryId 稳定性约束

> **关键依赖**：`buildStableLocalEntryId` 函数（位于 `ipc/services/rss-refresh.ts`）

- SyncOp 中的 `entityId` 直接使用此函数生成的确定性 hash
- `meta.json` 中 `entryIdAlgoVersion: 1` 对应当前算法
- 若算法升级，需同步更新版本号并编写迁移脚本补写旧 opId

---

## 十六、安全约束

> [!CAUTION]
> Git 仓库 **必须设为 Private**。ndjson 文件包含 feed URL 和完整阅读历史。

- 推荐方案：私人 GitHub/GitLab/Gitea 私有仓库
- 高安全方案：结合 [git-crypt](https://github.com/AGWA/git-crypt) 加密 `ops/` 目录
- 本方案不在应用层保存 Git 账户凭证，完全依赖系统 git credential 配置

---

## 十七、测试策略

### 单元测试

| 测试文件 | 覆盖内容 |
|---------|---------|
| `sync-logger.test.ts` | record/drain/pause/resume 逻辑 |
| `sync-export.test.ts` | exportState 返回值、ndjson 格式校验 |
| `sync-import.test.ts` | applyOp 幂等性、LWW 冲突决策 |
| `sync-git.test.ts` | GitRunner mock 测试 |

### 集成测试

- 双设备模拟：在同一机器两个 userData 目录模拟双设备
- mock Git：使用本地临时 bare repo 替代远端

### 手动验证

1. 两台真实 Mac 配置同一私有 GitHub 仓库
2. 设备 A 标记部分 entry 为已读 → 触发同步
3. 设备 B 启动 → 确认该 entry 也标记为已读
