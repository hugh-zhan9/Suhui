import { describe, expect, it, vi } from "vitest"

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ mocked: true })),
}))

const poolOn = vi.fn()

vi.mock("pg", () => ({
  Pool: vi.fn(() => ({
    on: poolOn,
  })),
}))

describe("main postgres db handles", () => {
  it("registers a pool error listener for idle connection failures", async () => {
    const { createMainDBHandles } = await import("./db.main")

    createMainDBHandles({
      type: "postgres",
      config: {
        host: "127.0.0.1",
        port: 5431,
        database: "suhui",
      },
    })

    expect(poolOn).toHaveBeenCalledWith("error", expect.any(Function))
  })
})
