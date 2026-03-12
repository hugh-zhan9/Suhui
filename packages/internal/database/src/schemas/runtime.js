export const getRuntimeDbType = () => {
  const override = globalThis.__followDbType || process.env.DB_TYPE
  return override === "postgres" ? "postgres" : "sqlite"
}
