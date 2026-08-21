import { describe, expect, it } from "vitest"

import { buildDbConversionRequest, conversionTargetOf } from "./db-conversion-request"

const emptyTarget = { dbConn: "", dbUser: "", dbPassword: "" }

describe("数据库转换请求", () => {
  it("转换目标就是当前方言的另一面", () => {
    expect(conversionTargetOf("postgres")).toBe("sqlite")
    expect(conversionTargetOf("sqlite")).toBe("postgres")
  })

  it("转到 SQLite 不需要输入，也不带任何目标参数", () => {
    const result = buildDbConversionRequest("sqlite", emptyTarget)

    expect(result).toEqual({ ok: true, request: { to: "sqlite" } })
  })

  it("转到 SQLite 时忽略填过的 Postgres 目标，避免误传", () => {
    const result = buildDbConversionRequest("sqlite", {
      dbConn: "127.0.0.1:5432/suhui",
      dbUser: "app",
      dbPassword: "pw",
    })

    expect(result).toEqual({ ok: true, request: { to: "sqlite" } })
  })

  it("转到 Postgres 缺连接串时拒绝", () => {
    expect(buildDbConversionRequest("postgres", emptyTarget)).toEqual({
      ok: false,
      reason: "missing_target_conn",
    })
  })

  it("只填空白字符也算缺连接串", () => {
    expect(
      buildDbConversionRequest("postgres", { dbConn: "   ", dbUser: "app", dbPassword: "pw" }),
    ).toEqual({ ok: false, reason: "missing_target_conn" })
  })

  it("转到 Postgres 时去掉首尾空白并带上凭据", () => {
    const result = buildDbConversionRequest("postgres", {
      dbConn: "  10.0.0.2:5432/suhui  ",
      dbUser: "  app  ",
      dbPassword: "pw",
    })

    expect(result).toEqual({
      ok: true,
      request: {
        to: "postgres",
        targetDbConn: "10.0.0.2:5432/suhui",
        targetDbUser: "app",
        targetDbPassword: "pw",
      },
    })
  })

  it("密码留空时不下发 targetDbPassword（让主进程用现有凭据而不是覆盖成空）", () => {
    const result = buildDbConversionRequest("postgres", {
      dbConn: "10.0.0.2:5432/suhui",
      dbUser: "app",
      dbPassword: "",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request).not.toHaveProperty("targetDbPassword")
  })
})
