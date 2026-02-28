import type { EmbeddedRsshubRoute } from "./rsshub-manifest"

export const EMBEDDED_RSSHUB_ROUTES: EmbeddedRsshubRoute[] = [
  { route: "/rsshub/routes/:lang?", type: "builtin" },
  { route: "/github/release/:owner/:repo", type: "redirect" },
  { route: "/github/commit/:owner/:repo", type: "redirect" },
]
