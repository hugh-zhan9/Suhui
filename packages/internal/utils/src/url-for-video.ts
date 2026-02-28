export const transformVideoUrl = ({
  url,
  mini = false,
  isIframe = false,
  attachments,
  lang,
}: {
  url: string
  mini?: boolean
  isIframe?: boolean
  attachments?:
    | {
        url: string
        mime_type?: string
      }[]
    | null
  lang?: string
}): string | null => {
  const parseYoutubeVideoId = (input: string) => {
    try {
      const parsed = new URL(input)
      const host = parsed.hostname.toLowerCase()
      if (host === "youtu.be") {
        return parsed.pathname.replace(/^\/+/, "").split("/")[0] || null
      }
      if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
        if (parsed.pathname.startsWith("/watch")) {
          return parsed.searchParams.get("v")
        }
        if (parsed.pathname.startsWith("/shorts/")) {
          return parsed.pathname.split("/")[2] || null
        }
        if (parsed.pathname.startsWith("/embed/")) {
          return parsed.pathname.split("/")[2] || null
        }
      }
      if (host === "www.youtube-nocookie.com" && parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null
      }
      return null
    } catch {
      return null
    }
  }

  if (
    url?.match(
      /\/\/(?:www\.bilibili\.com\/blackboard\/html5mobileplayer\.html|www\.bilibili\.com\/blackboard\/newplayer\.html|player\.bilibili\.com\/player\.html)\?/,
    )
  ) {
    return url
  }

  if (url?.match(/\/\/www.bilibili.com\/video\/BV\w+/)) {
    const player = isIframe
      ? "https://player.bilibili.com/player.html"
      : "https://www.bilibili.com/blackboard/newplayer.html"
    return `${player}?${new URLSearchParams({
      isOutside: "true",
      autoplay: "true",
      danmaku: "true",
      muted: mini ? "true" : "false",
      highQuality: "true",
      bvid: url.match(/\/\/www.bilibili.com\/video\/(BV\w+)/)?.[1] || "",
    }).toString()}`
  }

  const youtubeVideoId = parseYoutubeVideoId(url)
  if (youtubeVideoId) {
    return `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?${new URLSearchParams({
      controls: mini ? "0" : "1",
      autoplay: "1",
      mute: mini ? "1" : "0",
      hl: lang ?? "en-US",
      cc_lang_pref: lang ?? "en-US",
    }).toString()}`
  }

  if (url?.match(/\/\/www.pornhub.com\/view_video.php\?viewkey=\w+/)) {
    if (mini) {
      return null
    } else {
      return `https://www.pornhub.com/embed/${url.match(/\/\/www.pornhub.com\/view_video.php\?viewkey=(\w+)/)?.[1]}?${new URLSearchParams(
        {
          autoplay: "1",
        },
      ).toString()}`
    }
  }

  if (attachments) {
    return attachments.find((attachment) => attachment.mime_type === "text/html")?.url ?? null
  }
  return null
}
