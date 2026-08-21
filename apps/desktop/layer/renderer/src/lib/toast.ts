import type { ExternalToast } from "sonner"
import { toast as sonnerToast } from "sonner"

/**
 * 错误 toast 上要能把原文拿走。
 *
 * 应用全局 `select-none`（styles/base.css），toast 样式里已单独放开选中，
 * 但光能选中不够——报错常是排查唯一线索，所以每条错误 toast 默认挂一个「复制」
 * 动作，并把停留时间放长到 10 秒（默认 4 秒不够看完再复制）。
 */
export const deriveCopyText = (message: unknown, options?: ExternalToast): string => {
  const parts: string[] = []
  if (typeof message === "string") parts.push(message)
  else if (typeof message === "number") parts.push(String(message))

  const description = options?.description
  if (typeof description === "string") parts.push(description)

  return parts.join("\n").trim()
}

const withCopyAction = (message: unknown, options?: ExternalToast): ExternalToast => {
  // 调用方自带 action 时不抢占；拿不到纯文本（message 是 ReactNode）时也不硬加
  if (options?.action) return { duration: 10_000, ...options }

  const copyText = deriveCopyText(message, options)
  if (!copyText) return { duration: 10_000, ...options }

  return {
    duration: 10_000,
    ...options,
    action: {
      label: "复制",
      onClick: () => {
        void navigator.clipboard.writeText(copyText)
      },
    },
  }
}

type SonnerToast = typeof sonnerToast

export const toast: SonnerToast = Object.assign(
  ((message: never, options: never) => sonnerToast(message, options)) as SonnerToast,
  sonnerToast,
  {
    error: (message: Parameters<SonnerToast["error"]>[0], options?: ExternalToast) =>
      sonnerToast.error(message, withCopyAction(message, options)),
  },
)
