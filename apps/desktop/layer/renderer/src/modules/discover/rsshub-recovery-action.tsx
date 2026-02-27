import { Button } from "@follow/components/ui/button/index.js"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"

import { canRecoverRsshubByError } from "./rsshub-recovery"

export const RsshubRecoveryAction = ({
  errorMessage,
  onRecovered,
}: {
  errorMessage: string
  onRecovered?: () => Promise<void> | void
}) => {
  const showAction = canRecoverRsshubByError(errorMessage)

  const restartRsshubMutation = useMutation({
    mutationFn: async () => {
      const dbIpc = ipcServices?.db as
        | {
            restartRsshub?: () => Promise<unknown>
          }
        | undefined
      if (!dbIpc?.restartRsshub) {
        throw new Error("IPC_NOT_AVAILABLE")
      }
      await dbIpc.restartRsshub()
    },
    onSuccess: async () => {
      toast.success("已触发 RSSHub 重启，正在重试")
      await onRecovered?.()
    },
    onError: () => {
      toast.error("RSSHub 重启失败")
    },
  })

  if (!showAction) return null

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={restartRsshubMutation.isPending}
      onClick={() => restartRsshubMutation.mutate()}
    >
      {restartRsshubMutation.isPending ? "重启中..." : "立即重启内置 RSSHub"}
    </Button>
  )
}
