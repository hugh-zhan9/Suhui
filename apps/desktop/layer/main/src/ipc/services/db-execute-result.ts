export type ExecuteMethod = "run" | "all" | "get" | "values"

export const mapExecuteResult = (method: ExecuteMethod | undefined, result: any) => {
  if (method === "run") {
    return { rowsAffected: result?.rowCount ?? 0 }
  }
  if (method === "get") {
    return { rows: result?.rows?.[0] ?? null }
  }
  return { rows: result?.rows ?? [] }
}
