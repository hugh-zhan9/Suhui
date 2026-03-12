import type { RSSHubParameter, RSSHubParameterObject } from "@suhui/models/rsshub"

export const normalizeRSSHubParameters = (
  parameters: RSSHubParameter,
): RSSHubParameterObject | null =>
  parameters
    ? typeof parameters === "string"
      ? { description: parameters, default: null }
      : parameters
    : null
