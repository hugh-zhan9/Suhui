import { Button } from "@follow/components/ui/button/index.js"
import { toast } from "sonner"

import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { ipcServices } from "~/lib/client"

import { ExternalRsshubConfigModal } from "../rsshub/external-config-modal"
import { canRecoverRsshubByError } from "./rsshub-recovery"

export const RsshubRecoveryAction = ({
  errorMessage,
  onRecovered,
}: {
  errorMessage: string
  onRecovered?: () => Promise<void> | void
}) => {
  const showAction = canRecoverRsshubByError(errorMessage)
  const { present } = useModalStack()

  const openConfigModal = async () => {
    const settingIpc = ipcServices?.setting as
      | {
          getRsshubCustomUrl?: () => Promise<string>
          setRsshubCustomUrl?: (url: string) => Promise<void> | void
        }
      | undefined
    if (!settingIpc?.setRsshubCustomUrl) {
      toast.error("配置 RSSHub 失败：IPC 不可用")
      return
    }
    const currentUrl = (await settingIpc.getRsshubCustomUrl?.()) ?? ""
    present({
      title: "配置外部 RSSHub",
      content: ({ dismiss }) => (
        <ExternalRsshubConfigModal
          initialUrl={currentUrl}
          onCancel={dismiss}
          onSave={async (url) => {
            await settingIpc.setRsshubCustomUrl?.(url)
            toast.success("外部 RSSHub 已更新")
            dismiss()
            await onRecovered?.()
          }}
          onUsePublic={async () => {
            await settingIpc.setRsshubCustomUrl?.("https://rsshub.app")
            toast.success("已使用官方 RSSHub")
            dismiss()
            await onRecovered?.()
          }}
        />
      ),
    })
  }

  if (!showAction) return null

  return (
    <Button size="sm" variant="outline" onClick={() => void openConfigModal()}>
      配置外部 RSSHub
    </Button>
  )
}
