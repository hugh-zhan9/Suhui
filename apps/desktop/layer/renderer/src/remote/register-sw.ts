// Registers the remote client's service worker.
//
// Safari only offers "Add to Home Screen" for a page it can frame as an app,
// and a registered worker is also what keeps the shell available when the
// desktop app drops off the network mid-session. Registration failures are
// swallowed on purpose: the remote client works without a worker, and the page
// is served over plain HTTP on the LAN, where browsers refuse to register one
// unless the origin is localhost.
export const registerRemoteServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/remote-sw.js", { scope: "/" }).catch(() => {})
  })
}
