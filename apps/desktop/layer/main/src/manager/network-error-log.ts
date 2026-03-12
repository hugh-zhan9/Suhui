export const logNetworkRequestError = (
  details: {
    url: string
    error: string
    resourceType?: string
    method?: string
  },
  logger: { error: (...args: any[]) => void },
) => {
  logger.error("[Network Error]", {
    url: details.url,
    error: details.error,
    resourceType: details.resourceType,
    method: details.method,
  })
}
