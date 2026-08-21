import { defineConfig } from "drizzle-kit"

// SQLite 侧的迁移由 drizzle-kit 生成，journal 从 0040 续接。
// Postgres 侧维持 db.main.ts 的现状，不纳入本配置。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schemas/sqlite.ts",
  out: "./src/drizzle",
})
