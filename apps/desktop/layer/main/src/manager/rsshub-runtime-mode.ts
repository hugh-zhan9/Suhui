export type RsshubRuntimeMode = "lite" | "official"

export const RSSHUB_RUNTIME_MODE_STORE_KEY = "rsshubRuntimeMode" as const

export const normalizeRsshubRuntimeMode = (value: unknown): RsshubRuntimeMode => {
  if (value === "official") {
    return "official"
  }
  return "lite"
}
