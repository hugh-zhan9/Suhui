const keepModules = [
  "font-list",
  "vscode-languagedetection",
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
]

const rootNodeModulesIgnorePattern = new RegExp(`^/node_modules/(?!${keepModules.join("|")})`)
const nestedLayerNodeModulesIgnorePattern = /^\/layer\/[^/]+\/node_modules(?:\/|$)/
const sourceMapIgnorePattern = /^\/(?:layer\/[^/]+\/)?(?:dist|node_modules)\/.*\.map$/

export const packagerIgnorePatterns = [
  rootNodeModulesIgnorePattern,
  nestedLayerNodeModulesIgnorePattern,
  sourceMapIgnorePattern,
]

export const shouldIgnorePackagerPath = (path: string) =>
  packagerIgnorePatterns.some((pattern) => pattern.test(path))
