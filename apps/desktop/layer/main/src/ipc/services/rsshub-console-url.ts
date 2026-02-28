export function buildLocalRsshubConsoleUrl({ port, token }: { port: number; token?: string }) {
  const url = new URL(`http://127.0.0.1:${port}`)
  if (token) {
    url.searchParams.set("token", token)
  }
  return url.toString()
}
