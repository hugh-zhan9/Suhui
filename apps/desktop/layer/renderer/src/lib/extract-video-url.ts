export const extractVideoUrlFromHtml = (content?: string | null): string | null => {
  const input = (content || "")
    .trim()
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
  if (!input) return null

  const patterns = [
    /<iframe[^>]+src=["']([^"']+)["'][^>]*>/i,
    /<iframe[^>]+data-src=["']([^"']+)["'][^>]*>/i,
    /<video[^>]+src=["']([^"']+)["'][^>]*>/i,
    /<source[^>]+src=["']([^"']+)["'][^>]*>/i,
    /<a[^>]+href=["']([^"']*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|bilibili\.com\/video\/|player\.bilibili\.com\/player\.html)[^"']*)["'][^>]*>/i,
    /(https?:\/\/[^\s"'<>]*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|bilibili\.com\/video\/|player\.bilibili\.com\/player\.html)[^\s"'<>]*)/i,
  ]

  for (const pattern of patterns) {
    const matched = input.match(pattern)?.[1]?.trim()
    if (matched) return matched
  }

  return null
}
