import { Tooltip, TooltipContent, TooltipTrigger } from "@suhui/components/ui/tooltip/index.jsx"
import { cn } from "@suhui/utils/utils"

import { NetworkStatus, useNetworkStatus } from "~/atoms/network"

export const NetworkStatusIndicator = () => {
  const networkStatus = useNetworkStatus()

  if (networkStatus === NetworkStatus.ONLINE) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "fixed bottom-3 left-3 flex items-center gap-2 rounded-full border backdrop-blur-md transition-all duration-200 hover:scale-105",
            "px-3 py-2 shadow-lg ring-1 ring-inset",
            "border-red/30 bg-red/10 text-red ring-red/20",
            "dark:border-red/40 dark:bg-red/15 dark:text-red dark:ring-red/25",
            ELECTRON && "backdrop-blur-none",
            ELECTRON && "!bg-sidebar",
          )}
        >
          <i className="i-mgc-wifi-off-cute-re size-4 shrink-0 transition-all duration-200" />

          <span className="shrink-0 text-xs font-medium text-orange transition-colors duration-200">
            Local Mode
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[40ch] text-sm" align="start" side="top" sideOffset={8}>
        <div className="space-y-1">
          <div className="font-medium">🔄 Local Mode Active</div>
          <div className="text-xs leading-relaxed text-text-secondary">
            Operating in local data mode due to network connection failure. Some features may be
            limited.
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
