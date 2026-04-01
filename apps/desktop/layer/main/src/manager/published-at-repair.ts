export type RepairMode = "report" | "apply"

export type PublishedAtRepairArgs = {
  help: boolean
  mode: RepairMode
  feedId?: string
  limitPerFeed: number
  suspiciousWindowMs: number
  minCorrectionMs: number
  requestTimeoutMs: number
  output?: string
}

export const defaultPublishedAtRepairArgs = (): PublishedAtRepairArgs => ({
  help: false,
  mode: "report",
  limitPerFeed: 500,
  suspiciousWindowMs: 5_000,
  minCorrectionMs: 60 * 60 * 1000,
  requestTimeoutMs: 15_000,
})

export const parsePublishedAtRepairArgs = (args: string[]): PublishedAtRepairArgs => {
  const result = defaultPublishedAtRepairArgs()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) continue

    if (arg === "--help" || arg === "-h") {
      result.help = true
      continue
    }
    if (arg === "--mode") {
      const value = args[index + 1]
      if (!value || (value !== "report" && value !== "apply")) {
        throw new Error("Missing or invalid value for --mode, expected report|apply")
      }
      result.mode = value
      index += 1
      continue
    }
    if (arg === "--feed-id") {
      const value = args[index + 1]
      if (!value) throw new Error("Missing value for --feed-id")
      result.feedId = value
      index += 1
      continue
    }
    if (arg === "--limit-per-feed") {
      const value = Number(args[index + 1])
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Missing or invalid value for --limit-per-feed")
      }
      result.limitPerFeed = value
      index += 1
      continue
    }
    if (arg === "--suspicious-window-ms") {
      const value = Number(args[index + 1])
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("Missing or invalid value for --suspicious-window-ms")
      }
      result.suspiciousWindowMs = value
      index += 1
      continue
    }
    if (arg === "--min-correction-ms") {
      const value = Number(args[index + 1])
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("Missing or invalid value for --min-correction-ms")
      }
      result.minCorrectionMs = value
      index += 1
      continue
    }
    if (arg === "--request-timeout-ms") {
      const value = Number(args[index + 1])
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Missing or invalid value for --request-timeout-ms")
      }
      result.requestTimeoutMs = value
      index += 1
      continue
    }
    if (arg === "--output") {
      const value = args[index + 1]
      if (!value) throw new Error("Missing value for --output")
      result.output = value
      index += 1
      continue
    }
  }

  return result
}

export const isSuspiciousPublishedAt = ({
  publishedAt,
  insertedAt,
  suspiciousWindowMs,
}: {
  publishedAt: number
  insertedAt: number
  suspiciousWindowMs: number
}) => {
  return (
    Number.isFinite(publishedAt) &&
    Number.isFinite(insertedAt) &&
    publishedAt > 0 &&
    insertedAt > 0 &&
    Math.abs(insertedAt - publishedAt) <= suspiciousWindowMs
  )
}

export const shouldRepairPublishedAt = ({
  localPublishedAt,
  localInsertedAt,
  remotePublishedAt,
  suspiciousWindowMs,
  minCorrectionMs,
}: {
  localPublishedAt: number
  localInsertedAt: number
  remotePublishedAt: number
  suspiciousWindowMs: number
  minCorrectionMs: number
}) => {
  if (
    !isSuspiciousPublishedAt({
      publishedAt: localPublishedAt,
      insertedAt: localInsertedAt,
      suspiciousWindowMs,
    })
  ) {
    return false
  }

  if (!Number.isFinite(remotePublishedAt) || remotePublishedAt <= 0) {
    return false
  }

  return Math.abs(remotePublishedAt - localPublishedAt) >= minCorrectionMs
}

export const buildLooseIdentityKeys = ({
  guid,
  url,
  title,
}: {
  guid?: string | null
  url?: string | null
  title?: string | null
}) => {
  const keys: string[] = []

  const trimmedGuid = guid?.trim()
  if (trimmedGuid) keys.push(`guid:${trimmedGuid}`)

  const trimmedUrl = url?.trim()
  if (trimmedUrl) keys.push(`url:${trimmedUrl}`)

  const trimmedTitle = title?.trim()
  if (trimmedTitle) keys.push(`title:${trimmedTitle}`)

  return keys
}
