# Postgres DB 类型对齐设计

> 目标：在保持运行时逻辑不变的前提下，将数据库服务层类型对齐到 Postgres-only，消除 `DB` 联合类型导致的 Drizzle 调用不可用问题。

## 背景与问题

- 当前运行时已切换为 Postgres 作为唯一数据源，但类型层仍保留 SQLite 与 Postgres 的联合类型。
- Drizzle 的 `delete/insert/update` 在 SQLite 与 Postgres 的签名不兼容，导致 TypeScript 在服务层出现大量“联合类型不可调用”错误。
- 这属于“需求变动（Postgres-only）”造成的类型设计不匹配，而非业务逻辑 bug。

## 设计目标

- **类型对齐**：服务层使用 Postgres-only 类型，保证调用可用且类型正确。
- **保留迁移能力**：SQLite 类型仍保留为未来迁移/回滚的基础，但不参与当前编译路径。
- **最小改动**：不引入运行时行为变更，不重构业务逻辑。

## 方案概述

### 方案 A（采用）

- `DB` 类型收敛为 Postgres-only（`NodePgDatabase | PgRemoteDatabase`）。
- 新增 `LegacySqliteDB` 类型保留原 SQLite 联合类型。
- `db.ts` 与 `services/*` 只使用 `DB`（即 Postgres-only）。

### 方案 B（备选）

- 统一封装 `dbDelete/dbInsert/dbUpdate` 并重载类型，所有服务层调用改为封装函数。
- 改动面更大，风险更高，暂不采用。

### 方案 C（备选）

- 构建时 dialect 选择（define/alias）固化类型。
- 增加构建复杂度，暂不采用。

## 影响范围

- `packages/internal/database/src/types.ts`：类型定义调整。
- `packages/internal/database/src/db.ts`：导出类型与 `DB` 对齐。
- 可能新增类型测试以锁定 Postgres-only 约束。

## 数据流与运行时

- 运行时仍由 `db.main.ts` / `db.desktop.ts` 决定实际连接与 IPC 代理。
- 本次改动仅影响编译期类型检查，不改变运行时数据流。

## 错误处理

- 不新增额外错误处理逻辑，类型对齐不会引入运行时风险。

## 测试策略

- 新增类型级测试，确保 `DB` 只能为 Postgres 类型。
- 运行 `pnpm test`（包含 renderer typecheck）验证不再出现联合类型不可调用错误。

## 风险

- 若未来需要恢复 SQLite 运行路径，需重新设计类型对齐策略。
- 目前风险可控，属于类型层收敛。
