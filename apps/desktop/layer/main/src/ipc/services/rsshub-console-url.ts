export const buildLocalRsshubConsoleUrl = ({
  port,
  token: _token,
}: {
  port: number | null
  token: string | null
}) => {
  if (!port) {
    return null
  }

  return `http://127.0.0.1:${port}/`
}
