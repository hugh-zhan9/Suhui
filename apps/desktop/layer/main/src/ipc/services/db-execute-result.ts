import type { RawSqlResult } from "@suhui/database/db.main"

export type ExecuteMethod = "run" | "all" | "get" | "values"

/**
 * 把方言无关的执行结果整形为 drizzle proxy 期望的形状。
 * 方言差异（pg 的 fields/rowCount、sqlite 的 changes）已在 executeMainRawSql 内收敛。
 */
export const mapExecuteResult = (method: ExecuteMethod | undefined, result: RawSqlResult) => {
  if (method === "run") {
    return { rowsAffected: result.rowsAffected }
  }
  if (method === "get") {
    return { rows: result.rows[0] ?? null }
  }
  return { rows: result.rows }
}
