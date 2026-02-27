# FreeFolo 多设备同步方案设计

> **方案定稿**：增量 Oplog + Git 私有仓库
> 最后更新：2026-02-27

---

## 一、方案选型

### 为什么不同步 SQLite 文件

| 问题 | 说明 |
|------|------|
| 二进制冲突 | Git 无法合并，两台设备改了任意一行都会触发 binary conflict，只能人工选一个 |
| 写锁崩溃 | SQLite WAL 锁在多进程/多设备同时挂载同一文件时会直接报错 |
| 全量传输 | 每次 push 传输整个数据库文件（数十 MB） |

### 为什么选 Oplog，不选 Snapshot

| 维度 | Snapshot（快照） | **Oplog（本方案）** |
|------|:---:|:---:|
| 文件大小 | 随订阅数线性膨胀，5 万条 entry → 10MB+ JSON | 按日期分片，每天文件极小 |
| Git 合并 | JSON 数组行级冲突，基本必须手工解决 | ndjson 每行独立，自动合并率 > 95% |
| 历史审计 | 只有当前状态快照 | 完整操作历史，可回放、可回滚 |
| 孤儿状态 | 等比例存在，但更难修复 | 天然支持延迟重放（见第五章） |
| 实现成本 | 1–2 天 | **3–5 天**（本文档已设计好结构） |

**结论**：Oplog 方案中期维护成本远低于 Snapshot；考虑到 FreeFolo 作为长期个人工具，选 Oplog。

---

## 二、同步边界定义

**同步什么**（状态，State）：

| 表 | 同步字段 |
|----|---------|
| `entries` | `read`（已读状态） |
| `collections` | `entryId`（星标/收藏，增删） |
| `subscriptions` | 新增/删除订阅、`category`、`view`、`title`（自定义名称） |

**不同步什么**（内容，Content）：

- entry 正文（`content`、`description`、`media`）→ 各设备自行从 feed URL 拉取
- AI 摘要（`summaries`、`translations`）→ 本地生成，不跨设备
- AI 对话（`ai_chat_sessions`、`ai_chat_messages`）→ 本地隐私数据，不同步

---

## 三、Oplog 数据结构

### 3.1 单条操作事件（`SyncOp`）

```typescript
interface SyncOp {
  // === 标识 ===
  opId: string          // UUID v4，全局唯一，幂等键
  deviceId: string      // 设备唯一标识，建议 `crypto.randomUUID()` 初次生成后持久化

  // === 时序 ===
  logicalClock: number  // 单设备递增整数（Lamport Clock），不依赖 wall clock 排序
  ts: number            // wall clock 毫秒时间戳（仅用于 LWW 决策，不用于排序）

  // === 操作 ===
  type: OpType          // 见 3.2
  entityType: "entry" | "feed" | "subscription" | "collection"
  entityId: string      // entryId / feedId / subscriptionId / entryId（collection 用 entryId）

  // === 载荷 ===
  payload?: Record<string, unknown>  // 具体字段见 3.3
}

type OpType =
  | "entry.mark_read"
  | "entry.mark_unread"
  | "collection.add"        // 加星标
  | "collection.remove"     // 取消星标
  | "subscription.add"
  | "subscription.remove"
  | "subscription.update"   // category / title / view 变更
```

### 3.2 各操作 Payload

```typescript
// entry.mark_read / entry.mark_unread
// payload: 无（entityId 即 entryId，已足够）

// collection.add
interface CollectionAddPayload {
  feedId: string
  view: number    // FeedViewType
}

// collection.remove
// payload: 无

// subscription.add
interface SubscriptionAddPayload {
  feedId: string
  feedUrl: string
  view: number
  category?: string
  title?: string
}

// subscription.remove
// payload: 无

// subscription.update
interface SubscriptionUpdatePayload {
  category?: string
  title?: string
  view?: number
}
```

### 3.3 关键约束

> [!IMPORTANT]
> `entryId` 在 FreeFolo 中由 `feedId + guid/url/title+publishedAt` 派生（确定性 hash）。
> 必须在 meta 文件中记录算法版本号 `entryIdAlgoVersion`，防止版本升级后 oplog 失效。

---

## 四、Git 仓库结构

```
freefolo-sync/             ← 私有 Git 仓库（独立于代码仓库）
├── .gitattributes         ← 强制换行规范
├── meta.json              ← 全局元数据（见下方）
├── ops/
│   └── YYYY-MM-DD/
│       └── <deviceId>.ndjson   ← 每行一个 SyncOp（JSON Lines 格式）
└── snapshot/
    └── latest.json        ← 可选：full state snapshot，用于新设备初始化加速
```

**`.gitattributes`**：

```
*.ndjson  text  eol=lf
*.json    text  eol=lf
```

**`meta.json`**：

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

> [!CAUTION]
> **仓库必须设为 Private**。ops 文件包含 feed URL 和完整阅读记录，属于个人隐私数据。
> 如需更高安全级别，可配合 [git-crypt](https://github.com/AGWA/git-crypt) 或 [age](https://github.com/FiloSottile/age) 对 ops/ 目录加密。

---

## 五、设备同步流程

### 5.1 日常工作流

```
┌─────────────────────────────────────────────────────────┐
│                    启动 FreeFolo 前                       │
│  1. git pull --rebase origin main                        │
│  2. 扫描 ops/ 下所有未应用 opId → import-state           │
│  3. 按 (logicalClock, ts, deviceId) 升序回放             │
└─────────────────────────────────────────────────────────┘
                          ↓ 正常使用
┌─────────────────────────────────────────────────────────┐
│                    退出 / 定时触发                        │
│  4. export-state → 追加新产生的 ops 到 ndjson 文件        │
│  5. git add ops/YYYY-MM-DD/<deviceId>.ndjson             │
│  6. git commit -m "sync: <deviceId> <timestamp>"         │
│  7. git push origin main                                 │
└─────────────────────────────────────────────────────────┘
```

### 5.2 冲突处理规则（LWW — Last Write Wins）

| 操作类型 | 冲突决策规则 |
|---------|------------|
| `entry.mark_read` vs `entry.mark_unread` | 取 `ts` 最大值对应操作；相同 ts 时，`read` 优先（防止意外丢失已读） |
| `collection.add` vs `collection.remove` | 取 `ts` 最大值；相同 ts 时，`add` 优先（宁可误留，不可误删） |
| `subscription.update` 多字段 | 每字段独立 LWW，不整体覆盖 |
| `subscription.add` + `subscription.remove` | 取 `logicalClock` + `ts` 最大值操作 |

### 5.3 孤儿状态处理（Orphan Ops）

> 设备 B 导入 op 时，本地可能尚未拉取对应 entry（该 feed 未订阅或从未刷新）。

**解决方案**：本地新增 `pending_ops` 表（不在 sync 仓库中，仅本地 SQLite）：

```sql
CREATE TABLE IF NOT EXISTS pending_sync_ops (
  op_id TEXT PRIMARY KEY,
  op_json TEXT NOT NULL,          -- 完整 SyncOp JSON
  retry_after INTEGER DEFAULT 0   -- 时间戳，0 = 立即重试
);
```

**回放逻辑（import-state）**：

1. 回放 op 时，若 `entityId` 在本地 DB 中不存在 → 插入 `pending_sync_ops`
2. 每次 feed 刷新成功后，触发 `drainPendingOps(feedId)` 重新尝试回放
3. Pending ops 超过 **90天** 仍未匹配 → 标记为 `expired`，不再重试（防止永久堆积）

---

## 六、脚本接口规范

### `export-state`

**触发时机**：应用退出钩子 / 定时（每 10 分钟）

**输入**：上次 export 的 `logicalClock` 水位线（持久化到 `app.getPath("userData")/sync-meta.json`）

**输出**：追加新 SyncOp 到 `ops/YYYY-MM-DD/<deviceId>.ndjson`（每行一个 JSON）

```typescript
// 接口草案
async function exportState(opts: {
  syncDir: string        // git 仓库本地路径
  deviceId: string
  fromLogicalClock: number
}): Promise<{ exportedCount: number; newLogicalClock: number }>
```

### `import-state`

**触发时机**：`git pull` 完成后、应用启动时

**输入**：`ops/` 目录下所有 ndjson 文件

**核心逻辑**：

```typescript
async function importState(opts: {
  syncDir: string
  deviceId: string        // 跳过本设备自己的文件
}): Promise<{ appliedCount: number; pendingCount: number }>
```

**幂等性保障**：

```sql
-- applied_sync_ops 表：记录已应用的 opId
CREATE TABLE IF NOT EXISTS applied_sync_ops (
  op_id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
-- import 前先 SELECT，存在则跳过
```

---

## 七、Wind-down（日志压缩）

ops 文件按日期分片，30 天以上的文件自动归入 `ops/archive/`（保留但不参与增量 import）。

每季度（或手动触发）可运行 `compact-snapshot`，将当前全量状态写入 `snapshot/latest.json`，供新设备初始化时跳过历史 ops 直接加载快照，再仅回放 30 天内增量 ops。

---

## 八、开发路线图

| 阶段 | 内容 | 预估工时 |
|------|------|---------|
| **P0** 基础设施 | `deviceId` 初始化、`applied_sync_ops` 表、`pending_sync_ops` 表、`sync-meta.json` | 0.5 天 |
| **P1** export-state | 从 DB 读取增量变更 → 写 ndjson | 1 天 |
| **P2** import-state | 读 ndjson → 幂等回放 → 孤儿入 pending | 1.5 天 |
| **P3** Git 集成 | 封装 `git pull --rebase / add / commit / push` 为 IPC 命令，加 UI 按钮或启动/退出钩子 | 0.5 天 |
| **P4** snapshot | `compact-snapshot` 脚本、新设备初始化流程 | 0.5 天 |
| **P5** 错误处理 | push 冲突重试、ndjson 残缺行检测、clockDrift 警告 | 0.5 天 |

**总计估算**：4.5 天

---

## 九、风险与约束

| 风险 | 缓解措施 |
|------|---------|
| `entryId` 算法变更导致 oplog 失效 | `meta.json` 记录 `entryIdAlgoVersion`，升级时迁移脚本补写旧 opId |
| Wall clock 漂移（时区/NTP 跑偏） | 主排序依赖 `logicalClock`；`ts` 仅用于 LWW 决策 |
| Push 中断 → 部分提交 | ndjson 追加写，每次 flush 后做完整性校验（末行 JSON parse 校验） |
| 仓库私有泄露 | 建议 self-hosted Gitea 或 GitHub Private；高安全场景加 git-crypt |
| ops 文件无限增长 | 日期分片 + 30 天归档 + 季度 snapshot 压缩 |
