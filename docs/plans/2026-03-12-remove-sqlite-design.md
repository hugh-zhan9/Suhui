# Remove SQLite Runtime & Externalize Migration Design

**Goal:** 运行时彻底移除 SQLite/`better-sqlite3` 依赖，把 SQLite→Postgres 迁移改为用户手动脚本；IndexedDB→Postgres 迁移仍在主程序启动时自动处理。

**Scope:**

- 移除 `better-sqlite3` 依赖与打包拷贝逻辑
- 移除主程序内 SQLite 迁移入口（改为脚本）
- 新增根目录迁移脚本（手动执行）
- README 增加迁移提示与命令

---

## Design

### 1) 移除 SQLite 运行时依赖

- `apps/desktop/package.json` 删除 `better-sqlite3` 依赖。
- `apps/desktop/forge.config.cts` 移除 `better-sqlite3` 的保留拷贝逻辑：
  - `keepModules` 中移除 `better-sqlite3`
  - 删除 `ensureBetterSqliteBinary`/`replacePackagedBetterSqliteBinary` 相关调用
  - 打包不再要求 `better_sqlite3.node`

### 2) 迁移逻辑外置脚本

- 新增根目录脚本：`scripts/migrate-sqlite-to-postgres.ts`
- 默认使用旧应用的 SQLite 默认路径
- 提供 CLI 参数可覆盖 SQLite 路径与 Postgres 连接串
- 脚本复用现有迁移逻辑（从主进程迁出）

### 3) 保留 IndexedDB 迁移

- `migrateFromIndexedDB()` 仍保留在主程序启动链路（不依赖 `better-sqlite3`）

### 4) 文档更新

- README 增加迁移说明：首次使用且有历史数据时，执行脚本完成 SQLite→Postgres 迁移

---

## Risks

- 用户不执行迁移脚本会丢失 SQLite 历史数据
- 迁移脚本需要清晰参数与错误提示

---

## Validation

- `pnpm --filter @suhui/electron-main build`
- `pnpm test`
- `pnpm --filter suhui build:electron:unsigned`（打包不再要求 `better_sqlite3.node`）
