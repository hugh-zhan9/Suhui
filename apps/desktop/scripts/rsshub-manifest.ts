export type EmbeddedRsshubRoute = {
  route: string
  type: "builtin" | "redirect"
}

export const buildRsshubManifest = ({
  routes,
  runtimeType,
}: {
  routes: EmbeddedRsshubRoute[]
  runtimeType: "embedded-lite"
}) => ({
  generatedAt: new Date().toISOString(),
  runtimeType,
  routes,
})
