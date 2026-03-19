import { defineConfig } from "electron-vite"
import { resolve } from "pathe"

import { getGitHash } from "../../scripts/lib"
import rendererConfig from "./configs/vite.electron-render.config"
import { createPlatformSpecificImportPlugin } from "./plugins/vite/specific-import"

const workspaceAliases = {
  "@suhui/atoms": resolve("../../packages/internal/atoms/src"),
  "@suhui/components": resolve("../../packages/internal/components/src"),
  "@suhui/constants": resolve("../../packages/internal/constants/src"),
  "@suhui/database": resolve("../../packages/internal/database/src"),
  "@suhui/hooks": resolve("../../packages/internal/hooks/src"),
  "@suhui/models": resolve("../../packages/internal/models/src"),
  "@suhui/readability": resolve("../../packages/readability/src/index.ts"),
  "@suhui/shared": resolve("../../packages/internal/shared/src"),
  "@suhui/store": resolve("../../packages/internal/store/src"),
  "@suhui/tracker": resolve("../../packages/internal/tracker/src"),
  "@suhui/types": resolve("../../packages/internal/types"),
  "@suhui/utils": resolve("../../packages/internal/utils/src"),
}

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      lib: {
        entry: "./layer/main/src/index.ts",
      },
      rollupOptions: {
        external: ["bufferutil", "utf-8-validate", "pg", "pg-native"],
      },
    },
    resolve: {
      alias: {
        ...workspaceAliases,
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
        ...workspaceAliases,
        "@pkg": resolve("./package.json"),
        "@locales": resolve("../../locales"),
      },
    },
  },
  renderer: rendererConfig,
})
