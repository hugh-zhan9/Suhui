# FreeFolo 多设备同步 — 开发计划

> **方案**：Oplog + Git 私有仓库  
> **总预估工时**：4.5 天  
> **设计文档**：[sync-technical-design.md](./sync-technical-design.md)  
> **最后更新**：2026-02-28

---

## 里程碑概览

| 阶段 | 内容 | 预估 | 关键产出 |
|------|------|------|---------|
| **P0** | 基础设施 | 0.5 天 | deviceId、2 张新表、SyncManager 骨架 |
| **P1** | export-state | 1 天 | SyncLogger + 写 ndjson |
| **P2** | import-state | 1.5 天 | 幂等回放 + LWW + 孤儿 Op |
| **P3** | Git 集成 | 0.5 天 | GitRunner + 生命周期钩子 + 定时 flush |
| **P4** | Snapshot | 0.5 天 | 快照压缩 + 新设备初始化 |
| **P5** | 错误处理 | 0.5 天 | 冲突重试 / 残缺行 / 日志归档 |

---

## P0：基础设施（0.5 天）

### 任务列表

1. **DB Migration**（`packages/internal/database/src/`）
   - 新增 Drizzle migration 文件，追加 `applied_sync_ops` 表（DDL 见技术设计第三章）
   - 新增 `pending_sync_ops` 表
   - 更新 `schemas/index.ts`，导出两张新表的 Drizzle schema

2. **SyncManager 骨架**（`apps/desktop/layer/main/src/manager/sync.ts`）
   - 实现 `init()`：读/创建 `{userData}/sync-local-meta.json`
   - 实现 `deviceId` 持久化（`crypto.randomUUID()`）
   - 实现 `hasSyncRepo()` / `getSyncRepoPath()` / `updateSyncRepoPath()`

3. **IPC SyncService 骨架**（`apps/desktop/layer/main/src/ipc/services/sync.ts`）
   - 创建类，只实现 `getStatus()` 和 `setSyncRepoPath()`
   - 在 `apps/desktop/layer/main/src/ipc/index.ts` 注册 SyncService

### 验收标准
- DB migration 可运行（现有测试不回归）
- `getStatus()` IPC 可从渲染层调用并返回 `{ deviceId, syncRepoPath: null }`

---

## P1：export-state（1 天）

### 任务列表

1. **SyncLogger**（`manager/sync-logger.ts`）
   - 实现内存队列、自增 logicalClock、`record()` / `drain()` / `pause()` / `resume()`
   - 编写单元测试 `sync-logger.test.ts`

2. **钩子插入**
   - `DbService.updateReadStatus()` → `syncLogger.record({ type: "entry.mark_read/unread", ... })`
   - `DbService.addFeed()` → `syncLogger.record({ type: "subscription.add", ... })`
   - `DbService.deleteSubscriptionByTargets()` → `syncLogger.record({ type: "subscription.remove", ... })`
   - Collection IPC（需确认位置） → `collection.add/remove`

3. **exportState 函数**（`manager/sync-export.ts`）
   - 从 SyncLogger.drain() 获取队列
   - 确定今日 ndjson 文件路径：`{syncRepoPath}/ops/YYYY-MM-DD/{deviceId}.ndjson`
   - 追加写入（`fs.appendFileSync`，每行 JSON）
   - 末行 JSON.parse 完整性校验
   - 单元测试：mock fs，验证 ndjson 格式

4. **IPC**：`sync.exportState`

### 验收标准
- 在应用中操作，退出后 ndjson 文件存在且格式正确
- 单元测试通过

---

## P2：import-state（1.5 天）

### 任务列表

1. **importState 函数**（`manager/sync-import.ts`）
   - 扫描 ndjson 文件（跳过自己、跳过 archive）
   - 按 `(logicalClock, ts, deviceId)` 排序
   - 逐条 `applyOp()`：
     - `entry.mark_read/unread` → `EntryService.patchMany()`
     - `collection.add/remove` → 直接 SQL（Collection 无现成 Service，可用 `executeRawSql` 或新增 `CollectionService`）
     - `subscription.add` → `FeedService.upsertMany()` + `SubscriptionService.upsertMany()`
     - `subscription.remove` → `SubscriptionService.deleteByTargets()`
     - `subscription.update` → `SubscriptionService.patch()`
   - 成功 → INSERT `applied_sync_ops`
   - 实体不存在 → INSERT `pending_sync_ops`

2. **LWW 冲突解决**（`applyOp` 内部）
   - 查询 `applied_sync_ops` 中同一 entityId 的反向 op，比较 ts

3. **drainPendingOps(feedId)**（`manager/sync.ts`）
   - feed 刷新后调用，重试 pending ops

4. **IPC**：`sync.importState`

5. **单元测试**（`sync-import.test.ts`）
   - 幂等性：同一 opId 导入两次结果一致
   - LWW：mark_read 后 mark_unread（更旧 ts），最终状态为 read
   - 孤儿：entityId 不存在时写入 pending

### 验收标准
- 双设备模拟测试：设备 A export → 设备 B import，已读状态同步
- 单元测试通过

---

## P3：Git 集成（0.5 天）

### 任务列表

1. **GitRunner**（`manager/sync-git.ts`）
   - 使用 Node.js `child_process.execFile` 调用本地 `git`  
   - 实现：`pull()` / `add()` / `commit()` / `push()` / `syncCycle()`
   - 单元测试：mock `execFile`，验证命令参数

2. **Bootstrap 集成**（`manager/bootstrap.ts`）
   - `app.whenReady()` 后：`pull → importState`
   - `before-quit`：`exportState → add → commit → push`

3. **定时 Flush**（`manager/sync.ts`）
   - `setInterval(10 分钟, syncCycle)`

4. **UI**（`renderer/src/modules/settings/SyncSettings.tsx`）
   - 仓库路径配置输入框
   - 状态展示（上次同步时间、错误提示）
   - "立即同步" / "仅导出" / "仅导入" 按钮

5. **IPC**：`sync.gitSync`

### 验收标准
- 手动点击"立即同步"成功执行 git pull + import + export + commit + push
- 退出时自动触发同步

---

## P4：Snapshot（0.5 天）

### 任务列表

1. **compactSnapshot**（`manager/sync-snapshot.ts`）
   - 读取当前全量状态：subscriptions + collections + read entries
   - 写入 `{syncRepoPath}/snapshot/latest.json`

2. **importFromSnapshot**（首次 import 时调用）
   - 检测 `snapshot/latest.json` 是否存在
   - 若存在：先应用快照，再回放 30 天内增量 ops

3. **IPC**：`sync.compactSnapshot`

4. **UI**：设置页新增"生成快照"按钮

### 验收标准
- 新设备设置仓库路径 → 自动加载快照 → 读状态同步

---

## P5：错误处理（0.5 天）

### 任务列表

1. **push 冲突重试**：push 失败 → pull rebase → 重试一次
2. **ndjson 残缺行修复**：export 前校验末行，残缺则截断
3. **clockDrift 警告**：`ts` 与预期偏差 > 1 小时时记录警告日志
4. **ops 归档**：每次 import 时将 30 天以前目录移入 `ops/archive/`
5. **pending op 过期**：`drainPendingOps` 中标记 90 天以上为 `expired`

---

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `manager/sync.ts` | SyncManager 单例 |
| `manager/sync-git.ts` | GitRunner |
| `manager/sync-logger.ts` | SyncLogger（DB 写操作拦截器） |
| `manager/sync-export.ts` | exportState() 实现 |
| `manager/sync-import.ts` | importState() 实现 |
| `manager/sync-snapshot.ts` | compactSnapshot() / importFromSnapshot() |
| `ipc/services/sync.ts` | SyncService IPC |
| `renderer/.../SyncSettings.tsx` | 设置页 UI 组件 |
| 测试文件 × 4 | 单元测试 |
| DB migration 文件 × 1 | applied/pending_sync_ops 表 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `database/src/schemas/index.ts` | 追加 2 张新表 Schema |
| `ipc/services/db.ts` | 3 个写操作点插入 syncLogger.record() |
| `ipc/index.ts` | 注册 SyncService |
| `manager/bootstrap.ts` | 启动/退出同步钩子 |

---

## 验证计划

### 单元测试执行

```bash
# 在项目根目录执行
pnpm --filter FreeFolo test --run
```

新增测试文件：
- `apps/desktop/layer/main/src/manager/sync-logger.test.ts`
- `apps/desktop/layer/main/src/manager/sync-export.test.ts`
- `apps/desktop/layer/main/src/manager/sync-import.test.ts`
- `apps/desktop/layer/main/src/manager/sync-git.test.ts`

### 集成测试（本机双设备模拟）

```bash
# 1. 创建本地 bare repo
mkdir -p /tmp/freefolo-sync-test.git && cd /tmp/freefolo-sync-test.git && git init --bare

# 2. 设备 A：克隆 bare repo
git clone /tmp/freefolo-sync-test.git /tmp/freefolo-sync-a

# 3. 设备 B：克隆 bare repo
git clone /tmp/freefolo-sync-test.git /tmp/freefolo-sync-b

# 4. 启动 FreeFolo（设备 A userdata），配置 syncRepoPath=/tmp/freefolo-sync-a
# 5. 操作：标记若干 entry 为已读
# 6. 触发同步（点击"仅导出" + "推送"）
# 7. 切换到模拟设备 B（不同 userData 目录）
# 8. 配置 syncRepoPath=/tmp/freefolo-sync-b，触发"仅导入"
# 9. 验证：设备 B 中对应 entry 已标记已读
```

### 手动验证（真实双设备）

1. 在两台 Mac 上分别安装 FreeFolo
2. 在 GitHub/GitLab 创建 **私有** 空仓库
3. 两台设备分别克隆该仓库到本地
4. 两台设备分别在设置页配置 `syncRepoPath` 为克隆目录
5. 设备 A：订阅一个 RSS Feed，标记几条为已读，点击"立即同步"
6. 设备 B：点击"仅导入"，检查对应 Feed 和已读状态是否同步
7. 设备 B：取消一个收藏，点击"立即同步"
8. 设备 A：点击"仅导入"，检查收藏状态是否已更新

---

## 风险与缓解措施

| 风险 | 影响 | 缓解 |
|------|------|------|
| `entryId` 算法变更 | oplog 失效 | `meta.json` 记录算法版本，升级时迁移脚本 |
| Wall clock 漂移 | LWW 决策不准确 | 主排序依赖 logicalClock，ts 仅辅助 LWW |
| Push 中断 | 部分提交 | ndjson 末行校验，下次启动自动补全 |
| Git 未安装 | syncCycle 失败 | 启动时检测 `git --version`，提示安装 |
| 仓库非 Private | 隐私泄露 | 配置页显示安全提示，不强制（用户自负） |
| ops 无限增长 | 磁盘 / Git 性能 | 30 天归档 + 季度 snapshot 压缩 |

---

## Definition of Done

- [ ] P0-P5 所有任务完成
- [ ] 新增单元测试全部通过（`pnpm test --run`）
- [ ] 本机双设备集成测试验证通过
- [ ] 设置页 UI 实现且可操作
- [ ] 无新增 TypeScript 编译错误
- [ ] `AI-CONTEXT.md` 补充同步模块说明
