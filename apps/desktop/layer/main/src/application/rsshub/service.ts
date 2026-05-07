import { resolvePreviewFeedUrl } from "~/ipc/services/rsshub-external"
import { settingsApplicationService } from "~/application/settings/service"

export class RsshubApplicationService {
  getConfig() {
    return {
      customUrl: settingsApplicationService.getRsshubCustomUrl(),
    }
  }

  setConfig(input: { customUrl?: string }) {
    const customUrl = settingsApplicationService.setRsshubCustomUrl(input.customUrl ?? "")
    return { customUrl }
  }

  precheck(input: { url: string; allowPublicFallback?: boolean }) {
    const customBaseUrl = settingsApplicationService.getRsshubCustomUrl()
    const resolvedUrl = resolvePreviewFeedUrl(input.url, {
      customBaseUrl,
      allowPublicFallback: input.allowPublicFallback === true,
    })
    return {
      ok: true,
      customUrl: customBaseUrl,
      resolvedUrl,
    }
  }
}

export const rsshubApplicationService = new RsshubApplicationService()
