// 把 drizzle-kit 生成的 sqlite 迁移 SQL 编译成 TS 语句数组。
//
// 打包后的 app 里 .sql 文件不保证可读，而 postgres 侧本来就是把 DDL 写成
// 硬编码数组，这里保持一致：产物是纯 TS，打包器可直接内联。
// sqlite-migrations.test.ts 会校验产物与磁盘上的 SQL 一致。
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import path from "pathe"

const here = path.dirname(fileURLToPath(import.meta.url))
export const DRIZZLE_DIR = path.resolve(here, "../src/drizzle")
export const BASELINE_PATH = path.join(DRIZZLE_DIR, "sqlite-baseline.ts")

/** 按迁移 tag 分组，供运行时按账本逐个跳过已应用的迁移 */
export const collectSqliteMigrations = () => {
  const journal = JSON.parse(readFileSync(path.join(DRIZZLE_DIR, "meta/_journal.json"), "utf8"))
  const ordered = [...journal.entries].sort((a, b) => a.idx - b.idx)

  return ordered.map((entry) => ({
    tag: entry.tag,
    statements: readFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((chunk) => chunk.trim())
      .filter(Boolean),
  }))
}

export const renderBaseline = (migrations) =>
  `// 本文件由 scripts/generate-sqlite-baseline.mjs 生成，请勿手改。
// 改 schema 后依次运行：
//   pnpm exec drizzle-kit generate
//   node scripts/generate-sqlite-baseline.mjs --write

export type SqliteMigration = { tag: string; statements: readonly string[] }

export const sqliteMigrations: readonly SqliteMigration[] = [
${migrations
  .map(
    (m) =>
      `  {\n    tag: ${JSON.stringify(m.tag)},\n    statements: [\n${m.statements
        .map((s) => `      ${JSON.stringify(s)},`)
        .join("\n")}\n    ],\n  },`,
  )
  .join("\n")}
]
`

if (process.argv.includes("--write")) {
  const migrations = collectSqliteMigrations()
  const total = migrations.reduce((sum, m) => sum + m.statements.length, 0)
  writeFileSync(BASELINE_PATH, renderBaseline(migrations))
  console.info(
    `[generate-sqlite-baseline] ${migrations.length} 个迁移 / ${total} 条语句 -> ${BASELINE_PATH}`,
  )
}
