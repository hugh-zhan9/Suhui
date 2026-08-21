export type DbDialect = "postgres" | "sqlite"

export type PostgresTarget = {
  dbConn: string
  dbUser: string
  dbPassword: string
}

export type DbConversionRequest = {
  to: DbDialect
  targetDbConn?: string
  targetDbUser?: string
  targetDbPassword?: string
}

/** 当前方言的另一面就是转换目标。 */
export const conversionTargetOf = (dialect: DbDialect): DbDialect =>
  dialect === "sqlite" ? "postgres" : "sqlite"

/**
 * 组装转换请求。
 *
 * 转到 SQLite 不需要任何输入——主进程用应用数据目录下的默认库文件。
 * 转到 Postgres 必须带连接串：主进程收到空 dbConn 会退回按环境变量解析，
 * 那会让切库静默失败、紧随其后的 replace 恢复打在源库上，所以这里先拦一道。
 */
export const buildDbConversionRequest = (
  to: DbDialect,
  target: PostgresTarget,
): { ok: true; request: DbConversionRequest } | { ok: false; reason: "missing_target_conn" } => {
  if (to === "sqlite") {
    return { ok: true, request: { to } }
  }

  const dbConn = target.dbConn.trim()
  if (!dbConn) return { ok: false, reason: "missing_target_conn" }

  const { dbPassword } = target
  return {
    ok: true,
    request: {
      to,
      targetDbConn: dbConn,
      targetDbUser: target.dbUser.trim(),
      ...(dbPassword ? { targetDbPassword: dbPassword } : {}),
    },
  }
}
