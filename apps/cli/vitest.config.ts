import { defineProject } from "vitest/config"

export default defineProject({
  root: "./",
  test: {
    environment: "node",
    globals: true,
  },
})
