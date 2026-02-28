export const resolveHttpErrorMessage = (
  statusCode: number | undefined,
  responseText: string,
): string => {
  const body = responseText.trim()
  if (body.includes("RSSHUB_")) {
    return body
  }
  return `HTTP ${statusCode ?? 500}`
}
