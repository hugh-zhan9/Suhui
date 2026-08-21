export const unsignedForgeOutputRoot = "/tmp/suhui-forge-out"

export const retainedPackagedModules = [
  "better-sqlite3",
  "font-list",
  "vscode-languagedetection",
  "bindings",
  "file-uri-to-path",
  "pg",
  "pg-connection-string",
  "pg-pool",
  "pg-protocol",
  "pg-types",
  "pgpass",
  "pg-int8",
  "postgres-array",
  "postgres-bytea",
  "postgres-date",
  "postgres-interval",
  "split2",
  "xtend",
] as const

const rootNodeModulesIgnorePattern = new RegExp(
  `^/node_modules/(?!(?:${retainedPackagedModules.join("|")})(?:/|$))`,
)
const nestedLayerNodeModulesIgnorePattern = /^\/layer\/[^/]+\/node_modules(?:\/|$)/
const sourceMapIgnorePattern = /^\/(?:layer\/[^/]+\/)?(?:dist|node_modules)\/.*\.map$/
export const rsshubResourceIgnorePattern = /^\/resources\/rsshub(?:\/|$)/

export const packagerIgnorePatterns = [
  rootNodeModulesIgnorePattern,
  nestedLayerNodeModulesIgnorePattern,
  sourceMapIgnorePattern,
  rsshubResourceIgnorePattern,
]

const normalizePackagerPath = (path: string) => {
  const normalized = path.replaceAll("\\", "/").replaceAll(/\/{2,}/g, "/")
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export const shouldIgnorePackagerPath = (path: string) => {
  const normalized = normalizePackagerPath(path)
  return packagerIgnorePatterns.some((pattern) => pattern.test(normalized))
}
