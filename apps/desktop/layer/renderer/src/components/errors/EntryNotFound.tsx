import { Logo } from "@follow/components/icons/logo.jsx"
import type { FC } from "react"

import { CustomSafeError } from "../../errors/CustomSafeError"
import type { AppErrorFallbackProps } from "../common/AppErrorBoundary"
import { useResetErrorWhenRouteChange } from "./helper"

const EntryNotFoundErrorFallback: FC<AppErrorFallbackProps> = ({ resetError, error }) => {
  if (!(error instanceof EntryNotFound)) {
    throw error
  }

  useResetErrorWhenRouteChange(resetError)
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center rounded-md bg-theme-background p-2">
      <div className="center m-auto flex max-w-prose flex-col gap-4 text-center">
        <div className="center mb-8 flex">
          <Logo className="size-20" />
        </div>
        <p className="font-semibold">FreeFolo - 免费的离线 Folo RSS阅读器</p>
      </div>
    </div>
  )
}
export default EntryNotFoundErrorFallback

export class EntryNotFound extends CustomSafeError {
  constructor() {
    super("Entry 404")
  }
}
