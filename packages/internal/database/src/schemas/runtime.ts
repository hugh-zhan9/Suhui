export type RuntimeDbType = "sqlite" | "postgres"

export const getRuntimeDbType = (): RuntimeDbType => {
  const override = (globalThis as any).__followDbType || process.env.DB_TYPE
  return override === "postgres" ? "postgres" : "sqlite"
}
