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
      <div className="m-auto flex max-w-prose flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-bold">溯洄 (SuHui)</p>
        <p className="text-[14px] font-medium text-zinc-500 dark:text-zinc-400">溯源而读，回归纯粹</p>
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
