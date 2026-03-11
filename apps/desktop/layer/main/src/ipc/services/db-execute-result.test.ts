import { describe, expect, it } from "vitest"

import { mapExecuteResult } from "./db-execute-result"

describe("db execute mapping", () => {
  it("maps pg rows for all", () => {
    const result = mapExecuteResult("all", { rows: [{ id: 1 }] })
    expect(result).toEqual({ rows: [{ id: 1 }] })
  })

  it("maps pg rows for get", () => {
    const result = mapExecuteResult("get", { rows: [{ id: 2 }] })
    expect(result).toEqual({ rows: { id: 2 } })
  })

  it("maps pg rowCount for run", () => {
    const result = mapExecuteResult("run", { rowCount: 3, rows: [] })
    expect(result).toEqual({ rowsAffected: 3 })
  })

  it("preserves pg fields metadata when provided", () => {
    const result = mapExecuteResult("all", {
      rows: [[1, "title"]],
      fields: [{ name: "id" }, { name: "title" }],
    })
    expect(result).toEqual({
      rows: [[1, "title"]],
      fields: [{ name: "id" }, { name: "title" }],
    })
  })

  it("converts object rows to arrays when fields provided", () => {
    const result = mapExecuteResult("all", {
      rows: [{ id: 1, title: "title" }],
      fields: [{ name: "id" }, { name: "title" }],
    })
    expect(result).toEqual({
      rows: [[1, "title"]],
      fields: [{ name: "id" }, { name: "title" }],
    })
  })
})
