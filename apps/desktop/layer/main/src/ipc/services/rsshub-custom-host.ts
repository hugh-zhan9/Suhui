export const extractRsshubCustomHosts = (customUrl: string | null | undefined): string[] => {
  if (!customUrl) return []
  try {
    const parsed = new URL(customUrl)
    if (!parsed.hostname) return []
    return [parsed.hostname.toLowerCase()]
  } catch {
    return []
  }
}
