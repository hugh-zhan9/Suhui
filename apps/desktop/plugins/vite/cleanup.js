import fs from "node:fs"
import path from "pathe"
export function cleanupUnnecessaryFilesPlugin(files) {
  let config
  return {
    name: "cleanup-unnecessary",
    enforce: "post",
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    async generateBundle(_options) {
      await Promise.all(
        files.map((file) => {
          console.info(`Deleting ${path.join(config.build.outDir, file)}`)
          return fs.promises.unlink(path.join(config.build.outDir, file))
        }),
      )
    },
  }
}
