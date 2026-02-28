type MediaType = "photo" | "video"

type LocalMedia = {
  type: MediaType
  url: string
  preview_image_url?: string | null
}

type LocalAttachment = {
  url: string
  mime_type?: string
}

const decodeHtmlEntities = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")

const normalizeUrl = (raw: string) => {
  const input = decodeHtmlEntities((raw || "").trim())
  if (!input) return ""
  if (input.startsWith("//")) return `https:${input}`
  return input
}

const collectTagSrc = (html: string, tag: string) => {
  const re = new RegExp(`<${tag}[^>]+src=["']([^"']+)["'][^>]*>`, "gi")
  const result: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const value = normalizeUrl(match[1] || "")
    if (value) result.push(value)
  }
  return result
}

const collectTagHref = (html: string, tag: string) => {
  const re = new RegExp(`<${tag}[^>]+href=["']([^"']+)["'][^>]*>`, "gi")
  const result: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const value = normalizeUrl(match[1] || "")
    if (value) result.push(value)
  }
  return result
}

const looksLikeVideoLink = (url?: string | null) =>
  !!url &&
  /(?:youtube\.com|youtu\.be|youtube-nocookie\.com|bilibili\.com\/video\/|bilibili\.com\/blackboard\/|player\.bilibili\.com\/player\.html)/i.test(
    url,
  )

const collectPlainVideoUrls = (html: string) => {
  const re =
    /(https?:\/\/[^\s"'<>]*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|bilibili\.com\/video\/|bilibili\.com\/blackboard\/|player\.bilibili\.com\/player\.html)[^\s"'<>]*)/gi
  const result: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const value = normalizeUrl(match[1] || "")
    if (value) result.push(value)
  }
  return result
}

export const buildEntryMediaPayload = ({
  content,
  url,
}: {
  content?: string | null
  url?: string | null
}) => {
  const decoded = decodeHtmlEntities((content || "").trim())
  const imageUrls = collectTagSrc(decoded, "img")
  const videoUrls = Array.from(
    new Set([
      ...collectTagSrc(decoded, "iframe"),
      ...collectTagSrc(decoded, "video"),
      ...collectTagSrc(decoded, "source"),
      ...collectTagHref(decoded, "a").filter((item) => looksLikeVideoLink(item)),
      ...collectPlainVideoUrls(decoded),
    ]),
  )

  const media: LocalMedia[] = []
  const seen = new Set<string>()
  const previewImageUrl = imageUrls[0] || null

  for (const videoUrl of videoUrls) {
    const key = `video:${videoUrl}`
    if (seen.has(key)) continue
    seen.add(key)
    media.push({
      type: "video",
      url: videoUrl,
      preview_image_url: previewImageUrl,
    })
  }

  for (const imageUrl of imageUrls) {
    const key = `photo:${imageUrl}`
    if (seen.has(key)) continue
    seen.add(key)
    media.push({
      type: "photo",
      url: imageUrl,
    })
  }

  if (media.length === 0 && looksLikeVideoLink(url)) {
    const normalized = normalizeUrl(url || "")
    if (normalized) {
      media.push({
        type: "video",
        url: normalized,
      })
    }
  }

  const attachments: LocalAttachment[] = videoUrls.map((videoUrl) => ({
    url: videoUrl,
    mime_type: "text/html",
  }))

  return {
    media,
    attachments,
  }
}
