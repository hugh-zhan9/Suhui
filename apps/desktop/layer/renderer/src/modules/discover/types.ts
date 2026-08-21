export type ParsedFeedItem = {
  url: string
  title: string | null
  category?: string | null
}

/** 主进程 `localReading.previewOpml` 返回的条目。 */
export type ParsedOpmlItem = ParsedFeedItem & {
  index: number
  duplicate: boolean
}
