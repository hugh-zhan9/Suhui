import { cn } from "@follow/utils/utils"

import { useUISettingKey } from "~/atoms/settings/ui"

export const UnreadNumber = ({ unread, className }: { unread?: number; className?: string }) => {
  const showUnreadCount = useUISettingKey("sidebarShowUnreadCount")

  if (!unread) return null
  return (
    <div className={cn("center gap-1 text-[0.65rem] tabular-nums text-text-tertiary", className)}>
      <i className="i-mgc-round-cute-fi text-[0.3rem] text-amber-500" />
      {showUnreadCount ? unread : null}
    </div>
  )
}
