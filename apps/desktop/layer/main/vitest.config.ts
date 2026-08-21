import { fileURLToPath } from "node:url"

import tsconfigPath from "vite-tsconfig-paths"
import { defineProject } from "vitest/config"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

export default defineProject({
  root: "./",
  test: {
    globals: true,
    environment: "node",
    // 仓库根的 `pnpm -r test` 会让四个包同时开跑，机器满载时预览类用例
    // （本地 HTTP mock + 发现流程）会撞上 vitest 的 5s 默认超时并连带污染
    // 同文件后续用例的 spy 计数。这里只放宽调度余量，不改任何断言。
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },

  plugins: [
    tsconfigPath({
      projects: ["./tsconfig.json"],
    }),
  ],
})
