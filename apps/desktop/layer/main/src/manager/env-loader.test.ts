import { describe, expect, it } from "vitest"

import { resolveEnvPaths } from "./env-loader"

describe("env-loader", () => {
  it("loads resources before userData for override order", () => {
    const paths = resolveEnvPaths({
      userDataPath: "/user",
      resourcesPath: "/res",
    })
    expect(paths).toEqual(["/res/.env", "/user/.env"])
  })
})
