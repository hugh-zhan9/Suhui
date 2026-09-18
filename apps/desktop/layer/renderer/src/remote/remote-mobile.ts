import { useViewport } from "@suhui/components/hooks/useViewport.js"

/**
 * Phone/tablet layout boundary for the remote client.
 *
 * The shared `useMobile()` switched at 1024px while `remote.css` switched at
 * 767px, so in between the pane-hiding logic ran against a desktop-width
 * layout. The remote shell uses this one value on both sides instead.
 *
 * It sits at 1023 rather than 767 because the desktop layout reserves 256px of
 * sidebar and 390px of timeline: at 768px that would leave the reader about
 * 120px wide. Anything narrower than a real desktop window gets the app-shaped
 * shell, which is also the right call for a tablet in portrait.
 */
export const REMOTE_MOBILE_MAX_WIDTH = 1023

export const useRemoteMobile = () =>
  useViewport((viewport) => viewport.w > 0 && viewport.w <= REMOTE_MOBILE_MAX_WIDTH)

/** Bottom tabs, mirroring the desktop app's own sections minus anything cloud-only. */
export type RemoteMobileTab = "timeline" | "subscriptions" | "settings"
