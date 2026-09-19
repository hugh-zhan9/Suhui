import { useSyncExternalStore } from "react"

/**
 * Phone/tablet layout boundary for the remote client.
 *
 * It sits at 1023 rather than 767 because the desktop layout reserves 256px of
 * sidebar and 390px of timeline: at 768px that would leave the reader about
 * 120px wide. Anything narrower than a real desktop window gets the app-shaped
 * shell, which is also the right call for a tablet in portrait.
 */
export const REMOTE_MOBILE_MAX_WIDTH = 1023

const REMOTE_MOBILE_QUERY = `(max-width: ${REMOTE_MOBILE_MAX_WIDTH}px)`

const subscribe = (onChange: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const query = window.matchMedia(REMOTE_MOBILE_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

const getSnapshot = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(REMOTE_MOBILE_QUERY).matches
    : false

/**
 * Evaluates the very media query `remote.css` switches on.
 *
 * The shared `useMobile()` reads a jotai atom seeded from `window.innerWidth`
 * at module load and refreshed only by EventProvider, which this entry does not
 * mount. A phone that reports 0 before its first layout therefore left the atom
 * at 0 forever: the shell took its desktop branch and rendered every pane while
 * the stylesheet applied the phone rules, stacking all three into one column.
 * Asking matchMedia keeps the two sides from disagreeing by construction.
 */
export const useRemoteMobile = () => useSyncExternalStore(subscribe, getSnapshot, () => false)

/** Bottom tabs, mirroring the desktop app's own sections minus anything cloud-only. */
export type RemoteMobileTab = "timeline" | "subscriptions" | "settings"
