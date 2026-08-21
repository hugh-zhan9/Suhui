// 由 postgres.ts 机械生成 sqlite.ts。
//
// 两个方言必须逐列产出**相同的 JS 类型**，否则 schemas/types.ts 推导出的域类型
// 会变成联合类型并级联到全仓库（见 plan 的 D6）。手写两份必然漂移，所以这里
// 用固定规则转换，并由 sqlite-schema-parity.test.ts 断言产物与转换结果一致。
//
// 类型映射（左边 postgres，右边 sqlite，两侧 JS 类型相同）：
//   bigint(x, {mode:"number"})  -> integer(x)                     number
//   boolean(x)                  -> integer(x, {mode:"boolean"})   boolean
//   jsonb(x)                    -> text(x, {mode:"json"})         T（由 $type 决定）
//
// 特意不使用 integer(x, {mode:"timestamp_ms"})：那会返回 Date，而全仓库代码
// 按 number 处理时间戳。
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import path from "pathe"

const here = path.dirname(fileURLToPath(import.meta.url))
export const POSTGRES_SCHEMA_PATH = path.resolve(here, "../src/schemas/postgres.ts")
export const SQLITE_SCHEMA_PATH = path.resolve(here, "../src/schemas/sqlite.ts")

const HEADER = `// 本文件由 scripts/generate-sqlite-schema.mjs 从 postgres.ts 生成，请勿手改。
// 改动 schema 请改 postgres.ts，然后运行：
//   pnpm --filter @suhui/database exec node scripts/generate-sqlite-schema.mjs --write
// 两个方言必须逐列产出相同的 JS 类型，sqlite-schema-parity.test.ts 会校验这一点。
`

export const generateSqliteSchema = (postgresSource) => {
  let out = postgresSource

  out = out.replace(
    /import \{\n[^}]*\n\} from "drizzle-orm\/pg-core"/,
    `import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"`,
  )

  out = out.replaceAll("pgTable(", "sqliteTable(")
  out = out.replaceAll(/\bbigint\(("[a-z_]+"), \{ mode: "number" \}\)/g, "integer($1)")
  out = out.replaceAll(/\bboolean\(("[a-z_]+")\)/g, 'integer($1, { mode: "boolean" })')
  out = out.replaceAll(/\bjsonb\(("[a-z_]+")\)/g, 'text($1, { mode: "json" })')
  out = out.replaceAll(
    "sql`(extract(epoch from now()) * 1000)::bigint`",
    "sql`(unixepoch() * 1000)`",
  )

  return `${HEADER}${out}`
}

if (process.argv.includes("--write")) {
  const { writeFileSync } = await import("node:fs")
  const generated = generateSqliteSchema(readFileSync(POSTGRES_SCHEMA_PATH, "utf8"))
  writeFileSync(SQLITE_SCHEMA_PATH, generated)
  console.info(`[generate-sqlite-schema] 已写入 ${SQLITE_SCHEMA_PATH}`)
}
