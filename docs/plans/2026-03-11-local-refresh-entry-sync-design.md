# 本地刷新后同步条目到前端（设计稿）

## 背景

本地订阅刷新时，后端已成功写入 Postgres，但前端未立即重新拉取条目，导致“刷新后无文章，重启后才出现”。

## 目标

- 刷新成功后立刻在 UI 显示新条目（包含订阅视图与 All/Articles 视图）。
- 不改动 IPC 协议与后端返回结构。
- 保持改动最小、风险可控。

## 方案对比

1. 方案 A（推荐）：刷新成功后前端主动从本地 DB 拉取该订阅条目并更新 store。
   - 优点：改动小、风险低、无需改 IPC。
   - 缺点：刷新时多一次本地读取。
2. 方案 B：让 db.refreshFeed 返回 entries，前端直接更新 store。
   - 优点：减少一次 DB 读取。
   - 缺点：IPC 负载增加，接口变更面更大。
3. 方案 C：新增 db.refreshFeedAndGetEntries。
   - 优点：语义清晰。
   - 缺点：新增接口与调用路径，改动面最大。

## 选型

采用方案 A：刷新成功后，由前端主动拉取 entries 并更新 store。

## 设计

### 数据流

1. 点击刷新（本地模式） -> `ipc.invoke("db.refreshFeed", feedId)`
2. 刷新成功后 -> `entrySyncServices.fetchEntries({ feedId })`
3. `fetchEntries` 从本地 DB 取 entries -> `entryActions.upsertManyInSession` 更新 store
4. 订阅视图与 All/Articles 视图同步看到新条目

### 组件改动

- `EntryListHeader.tsx`：本地刷新成功后触发一次 `fetchEntries({ feedId })`。

### 错误处理

- `db.refreshFeed` 失败时保持现有提示，不额外吞错。
- 只有刷新成功后才触发条目拉取，避免误同步。

### 测试

- 增加单测：验证本地刷新完成后会触发一次 `fetchEntries` 调用（通过注入或 mock）。

## 风险

- 刷新时多一次本地读取，可能带来轻微开销，但可接受。
