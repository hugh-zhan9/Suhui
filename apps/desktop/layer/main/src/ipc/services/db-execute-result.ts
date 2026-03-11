export type ExecuteMethod = "run" | "all" | "get" | "values"

export const mapExecuteResult = (method: ExecuteMethod | undefined, result: any) => {
  const fields = result?.fields
  let rows = result?.rows ?? []
  if (fields && Array.isArray(rows) && rows.length > 0 && !Array.isArray(rows[0])) {
    const fieldNames = fields.map((field: { name: string }) => field.name)
    rows = rows.map((row: Record<string, unknown>) =>
      fieldNames.map((name) => row[name]),
    )
  }
  if (method === "run") {
    return { rowsAffected: result?.rowCount ?? 0 }
  }
  if (method === "get") {
    const payload: { rows: unknown; fields?: unknown } = { rows: rows?.[0] ?? null }
    if (fields) payload.fields = fields
    return payload
  }
  const payload: { rows: unknown[]; fields?: unknown } = { rows }
  if (fields) payload.fields = fields
  return payload
}
