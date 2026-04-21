export const SOURCE_CONTENT_LOAD_TIMEOUT_MS = 12000

export type SourceContentStatus = "loading" | "ready" | "degraded" | "hard-fail"

export type SourceContentEvent =
  | { type: "src-changed" }
  | { type: "success" }
  | { type: "timeout" }
  | { type: "hard-fail" }

export const isSourceContentHardFailEvent = ({
  errorCode,
  isMainFrame,
}: {
  errorCode?: number | string | null
  isMainFrame?: boolean
}) => {
  if (isMainFrame === false) {
    return false
  }

  return errorCode !== -3 && errorCode !== "ERR_ABORTED"
}

export const getSourceContentStatusAfterEvent = (
  current: SourceContentStatus,
  event: SourceContentEvent,
): SourceContentStatus => {
  switch (event.type) {
    case "src-changed":
      return "loading"
    case "success":
      return "ready"
    case "hard-fail":
      return "hard-fail"
    case "timeout":
      return current === "loading" ? "degraded" : current
    default:
      return current
  }
}

export const normalizeSourceContentPanelSrc = (src?: string | null) => {
  if (!src || src === "#") {
    return null
  }

  return src
}
