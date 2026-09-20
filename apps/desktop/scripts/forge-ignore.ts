export const unsignedForgeOutputRoot = "/tmp/suhui-forge-out"

// The main and preload bundles keep importing these at runtime: electron-vite marks
// them external, and packagerConfig.prune is false, so what survives in node_modules is
// decided here and nowhere else. Miss one and the installed app throws
// ERR_MODULE_NOT_FOUND while loading the main script, Electron answers with a modal it
// never gets to show, and the app just hangs at launch with an empty log. The
// prePackage hook runs assertPackagedModulesCovered against the built bundles so a new
// external dependency fails the build instead of the app.
const packagedModuleRoots = [
  "@protobufjs/aspromise",
  "@protobufjs/eventemitter",
  "@protobufjs/fetch",
  "@protobufjs/float",
  "@protobufjs/inquire",
  "@protobufjs/path",
  "@protobufjs/pool",
  "@protobufjs/utf8",
  "ajv",
  "ajv-formats",
  "better-sqlite3",
  "dotenv",
  "font-list",
  "pg",
  "vscode-languagedetection",
  "yaku",
] as const

// Dependencies of the modules above. They are never imported by our own code, so the
// bundle scan cannot see them; they still have to ship or the roots break on require.
const packagedModuleDependencies = [
  "bindings",
  "fast-deep-equal",
  "fast-uri",
  "file-uri-to-path",
  "json-schema-traverse",
  "node-addon-api",
  "obuf",
  "pg-connection-string",
  "pg-int8",
  "pg-pool",
  "pg-protocol",
  "pg-types",
  "pgpass",
  "postgres-array",
  "postgres-bytea",
  "postgres-date",
  "postgres-interval",
  "require-from-string",
  "split2",
  "xtend",
] as const

export const retainedPackagedModules = [
  ...packagedModuleRoots,
  ...packagedModuleDependencies,
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
