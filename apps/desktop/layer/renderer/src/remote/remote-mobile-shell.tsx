/**
 * App-shaped chrome for the remote client on phones: a bottom tab bar that sits
 * outside the reading panes, so the desktop layout keeps rendering untouched
 * above the breakpoint. Each pane already draws its own title header (and the
 * reader its own back button), so this adds no second header on top of them.
 */

import { cn } from "@suhui/utils/utils"

import type { RemoteMobileTab } from "./remote-mobile"

const TABS: { tab: RemoteMobileTab; label: string; icon: string }[] = [
  { tab: "timeline", label: "阅读", icon: "i-mgc-docment-cute-re" },
  { tab: "subscriptions", label: "订阅", icon: "i-mgc-rss-cute-fi" },
  { tab: "settings", label: "设置", icon: "i-mgc-settings-1-cute-re" },
]

export function RemoteMobileTabBar({
  activeTab,
  unreadCount,
  onChange,
}: {
  activeTab: RemoteMobileTab
  unreadCount: number
  onChange: (tab: RemoteMobileTab) => void
}) {
  return (
    <nav className="remote-mobile-tabbar" data-testid="remote-mobile-tabbar">
      {TABS.map(({ tab, label, icon }) => (
        <button
          key={tab}
          type="button"
          className={cn("remote-mobile-tab", activeTab === tab && "is-active")}
          aria-current={activeTab === tab ? "page" : undefined}
          onClick={() => onChange(tab)}
        >
          <span className="remote-mobile-tab-icon">
            <i className={icon} />
            {tab === "timeline" && unreadCount > 0 && (
              <span className="remote-mobile-tab-dot" aria-hidden />
            )}
          </span>
          <span className="remote-mobile-tab-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
