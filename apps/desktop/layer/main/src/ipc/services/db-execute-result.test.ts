import { describe, expect, it } from "vitest"

import { mapExecuteResult } from "./db-execute-result"

/**
 * 方言差异（pg 的 fields/rowCount、sqlite 的 changes）已在 executeMainRawSql
 * 内部收敛为「数组行 + rowsAffected」，这里只负责整形。
 */
describe("db execute mapping", () => {
  it("all 直接透传数组行", () => {
    expect(mapExecuteResult("all", { rows: [[1, "title"]], rowsAffected: 1 })).toEqual({
      rows: [[1, "title"]],
    })
  })

  it("get 取第一行", () => {
    expect(mapExecuteResult("get", { rows: [[2, "t"]], rowsAffected: 1 })).toEqual({
      rows: [2, "t"],
    })
  })

  it("get 无结果时返回 null", () => {
    expect(mapExecuteResult("get", { rows: [], rowsAffected: 0 })).toEqual({ rows: null })
  })

  it("run 只返回影响行数", () => {
    expect(mapExecuteResult("run", { rows: [], rowsAffected: 3 })).toEqual({ rowsAffected: 3 })
  })

  it("values 与 all 同形", () => {
    expect(mapExecuteResult("values", { rows: [[1]], rowsAffected: 1 })).toEqual({ rows: [[1]] })
  })

  it("method 缺省按 all 处理", () => {
    expect(mapExecuteResult(undefined, { rows: [[1]], rowsAffected: 1 })).toEqual({ rows: [[1]] })
  })
})
