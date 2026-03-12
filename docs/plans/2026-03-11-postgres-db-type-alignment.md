# Postgres DB Type Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 收敛数据库服务层的编译期类型为 Postgres-only，消除 Drizzle 调用的联合类型不可调用错误。

**Architecture:** 在类型层将 `DB` 改为 Postgres-only，并保留 SQLite 类型为 `LegacySqlite*` 以便后续迁移需求。新增类型级测试锁定约束。

**Tech Stack:** TypeScript, Vitest typecheck, Drizzle ORM

---

### Task 1: 添加 Postgres-only 类型测试

**Files:**

- Create: `apps/desktop/layer/renderer/src/lib/db-dialect.test-d.ts`

**Step 1: Write the failing test**

```ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import { assertType, test } from "vitest"

import type * as pgSchema from "@follow/database/schemas/postgres"
import type { DB } from "@follow/database/types"

type PostgresDb = NodePgDatabase<typeof pgSchema> | PgRemoteDatabase<typeof pgSchema>

test("DB type is postgres-only", () => {
  assertType<PostgresDb>({} as DB)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @follow/web test`

Expected: `TypeCheckError`，提示 `DB` 不能赋值给 `PostgresDb`（因为当前仍含 SQLite）。

**Step 3: Commit**

```bash
git add apps/desktop/layer/renderer/src/lib/db-dialect.test-d.ts
git commit -m "test: assert postgres-only db type"
```

---

### Task 2: 收敛 DB 类型为 Postgres-only

**Files:**

- Modify: `packages/internal/database/src/types.ts`
- Modify: `packages/internal/database/src/db.ts`

**Step 1: Write minimal implementation**

```ts
import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core/db"
import type * as schema from "./schemas"

export type LegacySqliteAsyncDb = BaseSQLiteDatabase<"async", any, typeof schema>
export type LegacySqliteSyncDb = BaseSQLiteDatabase<"sync", any, typeof schema>
export type LegacySqliteDB = LegacySqliteAsyncDb | LegacySqliteSyncDb

export type PostgresDB = NodePgDatabase<typeof schema> | PgRemoteDatabase<typeof schema>
export type DB = PostgresDB
```

在 `db.ts` 中将 `AsyncDb` 指向 `LegacySqliteAsyncDb`（保持兼容）：

```ts
import type { LegacySqliteAsyncDb } from "./types"
export type AsyncDb = LegacySqliteAsyncDb
```

**Step 2: Run test to verify it passes**

Run: `pnpm --filter @follow/web test`

Expected: renderer typecheck 通过，不再出现 `db.delete/insert/update` 的联合类型不可调用错误。

**Step 3: Run full test suite**

Run: `pnpm test`

Expected: 全部通过。

**Step 4: Commit**

```bash
git add packages/internal/database/src/types.ts packages/internal/database/src/db.ts
git commit -m "fix: align db types to postgres only"
```

---

### Task 3: Flight Recorder

**Step 1: Record change**

Run:

```bash
python3 "/Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py" "Bugfix" "收敛数据库服务层类型为 Postgres-only，消除 Drizzle 联合类型调用错误" "类型层改动可能影响未来 SQLite 回滚路径；目前保留 Legacy 类型以降低风险" "S2" "packages/internal/database/src/types.ts,packages/internal/database/src/db.ts,apps/desktop/layer/renderer/src/lib/db-dialect.test-d.ts"
```

---

### Task 4: 合并到 main

**Step 1: Merge**

```bash
git checkout main
git merge fix/local-refresh-entry-sync
```

**Step 2: Verify**

Run: `pnpm test`

Expected: 全部通过。
