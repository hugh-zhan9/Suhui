// Service worker for the remote reading client (remote.html).
//
// Served from the root so its default scope covers "/". It exists to make the
// page installable and to keep the shell usable while the desktop app is
// briefly unreachable — it is deliberately not an offline reading cache:
// every /api/ response and the /events stream go straight to the network, so
// the phone never shows entries that the desktop has already changed.

const CACHE = "suhui-remote-shell-v1"
const SHELL_URL = "/"

// Requests that must always hit the network: they are either live state or a
// stream that a cache would break.
const isBypassed = (url) =>
  url.pathname.startsWith("/api/") ||
  url.pathname === "/events" ||
  url.pathname === "/status" ||
  url.pathname === "/health" ||
  url.pathname === "/remote.js"

// Build output is content-hashed, and the icons never change within a release.
const isImmutable = (url) =>
  url.pathname.startsWith("/assets/") || url.pathname.startsWith("/remote-icon-")

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isBypassed(url)) return

  if (request.mode === "navigate") {
    // Network first: a reachable desktop must always win, because the shell
    // decides which API base and capabilities the client uses.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(SHELL_URL, copy))
          return response
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error())),
    )
    return
  }

  if (!isImmutable(url)) return

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
