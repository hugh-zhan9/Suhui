# Postgres Auto Create + SQLite Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Postgres 启动时自动建库、初始化表结构；若 Postgres 为空且本地 SQLite 有数据，则自动迁移。

**Architecture:**

- 主进程新增 Postgres 引导模块，负责解析 DB 名、创建数据库。
- 新增 SQLite -> Postgres 迁移模块，按表顺序导入并做 JSON/Boolean 转换。
- DBManager 启动流程接入自动建库与条件迁移逻辑。
- README 补充自动建库与迁移说明。

**Tech Stack:** TypeScript, Electron Main, better-sqlite3, pg, Vitest

---

### Task 1: 为 Postgres 引导逻辑添加失败测试

**Files:**

- Create: `apps/desktop/layer/main/src/manager/postgres-bootstrap.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest"

import {
  buildPostgresAdminConfig,
  ensurePostgresDatabaseExists,
  getTargetDatabaseName,
} from "./postgres-bootstrap"

describe("postgres bootstrap", () => {
  it("extracts database name from host:port/dbname", () => {
    expect(getTargetDatabaseName({ DB_CONN: "127.0.0.1:5432/suhui" })).toBe("suhui")
  })

  it("extracts database name from connection string", () => {
    expect(
      getTargetDatabaseName({
        DB_CONN: "postgres://u:p@127.0.0.1:5432/suhui?sslmode=disable",
      }),
    ).toBe("suhui")
  })

  it("builds admin config for host:port", () => {
    expect(
      buildPostgresAdminConfig({
        DB_CONN: "127.0.0.1:5432/suhui",
        DB_USER: "u",
        DB_PASSWORD: "p",
      }),
    ).toEqual({ host: "127.0.0.1", port: 5432, database: "postgres", user: "u", password: "p" })
  })

  it("creates database when missing", async () => {
    const queries: string[] = []
    const poolFactory = () => ({
      query: vi.fn(async (sql: string) => {
        queries.push(sql)
        if (sql.includes("pg_database")) return { rowCount: 0, rows: [] }
        return { rowCount: 0, rows: [] }
      }),
      end: vi.fn(async () => undefined),
    })

    await ensurePostgresDatabaseExists(
      { DB_CONN: "127.0.0.1:5432/suhui", DB_USER: "u", DB_PASSWORD: "p" },
      poolFactory,
    )

    expect(queries.some((q) => q.startsWith("CREATE DATABASE"))).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts apps/desktop/layer/main/src/manager/postgres-bootstrap.test.ts
```

Expected: FAIL（模块尚不存在）。

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/postgres-bootstrap.test.ts

git commit -m "test: add postgres bootstrap coverage"
```

---

### Task 2: 为迁移判断逻辑添加失败测试

**Files:**

- Create: `apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts`

**Step 1: Write the failing test**

```ts
import fs from "node:fs"
import os from "node:os"

import { join } from "pathe"
import { describe, expect, it, vi } from "vitest"
import BDatabase from "better-sqlite3"

import { hasSqliteData, isPostgresEmpty } from "./sqlite-postgres-migration"

describe("sqlite -> postgres migration helpers", () => {
  it("detects postgres empty by counts", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("feeds")) return { rows: [{ count: "0" }] }
        if (sql.includes("subscriptions")) return { rows: [{ count: "0" }] }
        if (sql.includes("entries")) return { rows: [{ count: "0" }] }
        return { rows: [{ count: "0" }] }
      }),
    }

    await expect(isPostgresEmpty(pool as any)).resolves.toBe(true)
  })

  it("detects sqlite data when entries exist", () => {
    const tmp = fs.mkdtempSync(join(os.tmpdir(), "folo-sqlite-"))
    const dbPath = join(tmp, "suhui_local.db")
    const sqlite = new BDatabase(dbPath)
    sqlite.exec("CREATE TABLE entries (id text primary key)")
    sqlite.exec("INSERT INTO entries (id) VALUES ('e1')")
    sqlite.close()

    expect(hasSqliteData(dbPath)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts
```

Expected: FAIL（模块尚不存在）。

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts

git commit -m "test: add sqlite postgres migration helpers"
```

---

### Task 3: 实现 Postgres 自动建库

**Files:**

- Create: `apps/desktop/layer/main/src/manager/postgres-bootstrap.ts`

**Step 1: Implement minimal code**

- 提供 `getTargetDatabaseName`、`buildPostgresAdminConfig`、`ensurePostgresDatabaseExists`。
- 连接默认库 `postgres` 检查/创建目标库。

**Step 2: Run tests**

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts apps/desktop/layer/main/src/manager/postgres-bootstrap.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/postgres-bootstrap.ts

git commit -m "feat: ensure postgres database exists"
```

---

### Task 4: 实现迁移判断与迁移流程

**Files:**

- Create: `apps/desktop/layer/main/src/manager/sqlite-postgres-migration.ts`

**Step 1: Implement minimal code**

- 实现 `hasSqliteData`、`isPostgresEmpty`。
- 实现 `migrateSqliteToPostgres`（按表顺序迁移、JSON/Boolean 转换、批量插入）。

**Step 2: Run tests**

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts \
  apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/sqlite-postgres-migration.ts

git commit -m "feat: migrate sqlite data to postgres"
```

---

### Task 5: 接入启动流程

**Files:**

- Modify: `apps/desktop/layer/main/src/manager/db.ts`

**Step 1: Implement minimal code**

- 在 Postgres 初始化前调用 `ensurePostgresDatabaseExists`。
- 完成建库后再 `initializeMainDB` + `migrateMainDB`。
- 若 Postgres 空且 SQLite 有数据，则执行迁移。

**Step 2: Run tests**

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts \
  apps/desktop/layer/main/src/manager/postgres-bootstrap.test.ts \
  apps/desktop/layer/main/src/manager/sqlite-postgres-migration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/db.ts

git commit -m "feat: auto create postgres and migrate sqlite"
```

---

### Task 6: README 更新

**Files:**

- Modify: `README.md`

**Step 1: Update README**

- 说明 Postgres 自动建库与自动迁移条件。

**Step 2: Commit**

```bash
git add README.md

git commit -m "docs: document postgres auto migrate"
```
