# Remove SQLite Runtime & Externalize Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除运行时 SQLite/`better-sqlite3` 依赖，将 SQLite→Postgres 迁移改为手动脚本，同时保留 IndexedDB→Postgres 启动迁移。

**Architecture:** 先删除打包与运行时对 `better-sqlite3` 的依赖和拷贝逻辑；再把主进程 SQLite 迁移逻辑迁出到根目录脚本，脚本默认使用旧 SQLite 默认路径并支持覆盖参数；最后补充 README 迁移说明并验证构建、测试与打包。

**Tech Stack:** TypeScript, Electron Forge, pnpm, Postgres

---

### Task 1: 移除 SQLite 运行时依赖

**Files:**

- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/forge.config.cts`
- Modify: `package.json`

**Step 1: Write the failing test**

- 以构建打包失败为基线：当前打包依赖 `better_sqlite3.node`，后续应不再需要。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter suhui build:electron:unsigned
```

Expected: FAIL due to missing `better_sqlite3.node`.

**Step 3: Write minimal implementation**

- 从 `apps/desktop/package.json` 移除 `better-sqlite3` 依赖。
- 在根目录 `package.json` 增加 `better-sqlite3` 作为开发依赖，仅用于迁移脚本。
- 从 `apps/desktop/forge.config.cts` 移除 `better-sqlite3` 相关逻辑：
  - `keepModules` 中移除
  - 删除 `ensureBetterSqliteBinary`/`replacePackagedBetterSqliteBinary` 及其调用

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter suhui build:electron:unsigned
```

Expected: PASS without `better_sqlite3.node`.

**Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/forge.config.cts package.json
git commit -m "移除sqlite运行时依赖与打包拷贝"
```

---

### Task 2: 迁移脚本外置

**Files:**

- Create: `scripts/migrate-sqlite-to-postgres.ts`
- Modify: `apps/desktop/layer/main/src/manager/sqlite-postgres-migration.ts`
- Modify: `apps/desktop/layer/main/src/manager/db.ts`
- Modify: `apps/desktop/layer/main/src/ipc/services/db.ts`
- Modify: `packages/internal/database/src/db.main.ts`
- Modify: `packages/internal/database/src/db.desktop.ts` (如需去除 sqlite 分支)

**Step 1: Write the failing test**

- 为脚本添加最小化运行验证（如 CLI 参数缺失时报错）。
- 为 Postgres-only 路径新增/更新单测（`db-config`/`db` 初始化默认 postgres）。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm tsx scripts/migrate-sqlite-to-postgres.ts
```

Expected: FAIL with missing arguments error.

**Step 3: Write minimal implementation**

- 将 SQLite→Postgres 迁移逻辑抽成脚本，支持：
  - 默认使用旧 SQLite 默认路径
  - `--sqlite <path>` 覆盖默认路径
  - `--postgres <dsn>` 覆盖 Postgres 连接串
- 复用现有 `migrateSqliteToPostgres` 逻辑（从主进程调用移除）。
- 主进程只走 Postgres 初始化，不再自动触发 SQLite 迁移；IndexedDB 迁移保持。
- `db.main.ts` 去除 SQLite 分支与 `better-sqlite3` 依赖。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm tsx scripts/migrate-sqlite-to-postgres.ts --help
```

Expected: 输出帮助或参数错误提示，脚本可执行。

**Step 5: Commit**

```bash
git add scripts/migrate-sqlite-to-postgres.ts apps/desktop/layer/main/src/manager/sqlite-postgres-migration.ts apps/desktop/layer/main/src/manager/db.ts apps/desktop/layer/main/src/ipc/services/db.ts packages/internal/database/src/db.main.ts packages/internal/database/src/db.desktop.ts
git commit -m "迁移sqlite逻辑为手动脚本"
```

---

### Task 3: README 文档更新

**Files:**

- Modify: `README.md`

**Step 1: Write the failing test**

- 无自动测试，按文档要求手动核对。

**Step 2: Run test to verify it fails**

- 检查 README 是否缺少迁移说明。

**Step 3: Write minimal implementation**

- README 增加“历史数据迁移”小节，说明默认读取旧 SQLite 路径，并给出覆盖参数示例。

**Step 4: Run test to verify it passes**

- 手动检查 README 文案。

**Step 5: Commit**

```bash
git add README.md
git commit -m "文档: 增加sqlite迁移脚本说明"
```

---

### Task 4: 全量验证与飞行记录

**Files:**

- Modify: `docs/AI_CHANGELOG.md`

**Step 1: Run verification**

```bash
pnpm --filter @suhui/electron-main build
pnpm test
pnpm --filter suhui build:electron:unsigned
```

Expected: PASS.

**Step 2: Flight recorder**

```bash
python3 "/Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py" "Refactor" "移除sqlite运行时依赖并提供手动迁移脚本" "可能影响历史SQLite用户迁移路径，需按README指引执行脚本" "S2"
```

**Step 3: Commit**

```bash
git add docs/AI_CHANGELOG.md
git commit -m "chore: 记录移除sqlite与迁移脚本变更"
```
