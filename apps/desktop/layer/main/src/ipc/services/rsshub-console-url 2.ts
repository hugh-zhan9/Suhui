export function buildLocalRsshubConsoleUrl({
  port,
  token,
}: {
  port: number | null
  token: string | null
}): string | null {
  if (!port) return null
  const url = new URL(`http://localhost:${port}`)
  if (token) {
    url.searchParams.set("token", token)
  }
  return url.toString()
}
