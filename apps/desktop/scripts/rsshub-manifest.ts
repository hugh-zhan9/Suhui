export type EmbeddedRsshubRoute = {
  route: string
  type: "builtin" | "redirect" | "whitelist"
}

export const buildRsshubManifest = ({
  routes,
  runtimeType,
}: {
  routes: EmbeddedRsshubRoute[]
  runtimeType: "embedded-lite" | "embedded-official" | "embedded-dual"
}) => ({
  generatedAt: new Date().toISOString(),
  runtimeType,
  routes,
})
