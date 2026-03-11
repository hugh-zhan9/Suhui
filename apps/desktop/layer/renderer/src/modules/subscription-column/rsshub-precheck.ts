export type RsshubPrecheckClient = {
  getCustomUrl: () => Promise<string | null | undefined>
}

export const ensureRsshubRuntimeReady = async (client: RsshubPrecheckClient) => {
  const customUrl = (await client.getCustomUrl())?.trim()
  if (customUrl) return
  throw new Error("RSSHUB_EXTERNAL_UNCONFIGURED: 未配置外部 RSSHub 实例")
}
