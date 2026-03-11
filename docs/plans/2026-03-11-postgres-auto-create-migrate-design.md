# Postgres 自动建库与 SQLite 迁移设计

**目标**：当 `DB_TYPE=postgres` 时，启动自动检测/创建数据库与表结构，并在 Postgres 为空且存在 SQLite 数据时自动迁移。

## 背景与约束

- Postgres 作为可选本地数据库。
- 不写死数据库密码，仍由用户 `.env` 提供。
- 迁移仅在 Postgres 为空时执行，避免覆盖已有数据。

## 方案对比

1. 启动自动创建 + 自动迁移（选定）：最符合“开箱即用”。
2. 只创建库 + 手动迁移：不符合“自动迁移”。
3. 缺库即报错：不符合需求。

## 设计与范围

### 启动流程

- 解析 `DB_CONN` 获取数据库名（默认 `suhui`）。
- 使用管理连接（默认库 `postgres`）检查 `pg_database`，不存在则创建。
- 连接目标库并执行表结构初始化。
- 若 Postgres 为空且 SQLite 有数据，则迁移。

### 判定“Postgres 为空”

- 检查关键表 `feeds/subscriptions/entries` 记录数是否为 0。
- 全部为 0 才视为“空库”。

### 迁移策略（SQLite -> Postgres）

- 条件：SQLite 文件存在且有数据。
- 迁移顺序：
  - feeds -> subscriptions -> inboxes -> lists -> users -> entries -> collections -> summaries -> translations -> images -> ai_chat_sessions -> ai_chat_messages -> unread -> applied_sync_ops -> pending_sync_ops
- 处理：
  - JSON 字段解析为对象后插入 Postgres。
  - Boolean 从 0/1 转换为 true/false。
  - 事务包裹迁移，保证一致性。

### README 更新

- 说明自动建库与自动迁移触发条件与注意事项。

## 验收

- Postgres 不存在时可自动创建并初始化。
- Postgres 空库且 SQLite 有数据时自动迁移成功。
- Postgres 非空时不会迁移。
