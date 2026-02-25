import { defineConfig } from "electron-vite"
import { resolve } from "pathe"

import { getGitHash } from "../../scripts/lib"
import { createPlatformSpecificImportPlugin } from "./plugins/vite/specific-import"
import rendererConfig from "./configs/vite.electron-render.config"

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      lib: {
        entry: "./layer/main/src/index.ts",
      },
      rollupOptions: {
        external: ["bufferutil", "utf-8-validate", "better-sqlite3"],
      },
    },
    resolve: {
      alias: {
        "@shared": resolve("packages/shared/src"),
        "@pkg": resolve("./package.json"),
        "@locales": resolve("../../locales"),
        "~": resolve("./layer/main/src"),
        "utf-8-validate": resolve("./layer/main/src/shims/utf-8-validate.cjs"),
      },
    },
    define: {
      ELECTRON: "true",
      GIT_COMMIT_HASH: JSON.stringify(getGitHash()),
    },
    plugins: [
      createPlatformSpecificImportPlugin("main"),
      {
        name: "import-sql",
        transform(code, id) {
          if (id.endsWith(".sql")) {
            const json = JSON.stringify(code)
              .replaceAll("\u2028", "\\u2028")
              .replaceAll("\u2029", "\\u2029")

            return {
              code: `export default ${json}`,
            }
          }
        },
      },
    ],
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: {
        entry: "./layer/main/preload/index.ts",
      },
    },
    resolve: {
      alias: {
        "@pkg": resolve("./package.json"),
        "@locales": resolve("../../locales"),
      },
    },
  },
  renderer: rendererConfig,
})
