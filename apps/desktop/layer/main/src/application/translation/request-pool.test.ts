import { describe, expect, it, vi } from "vitest"

import { TranslationRequestPool } from "./request-pool"

describe("article translation request pool", () => {
  it("starts five requests, queues the sixth, and releases slots after failure", async () => {
    const pool = new TranslationRequestPool()
    const started: number[] = []
    const finish: Array<() => void> = []
    const requests = Array.from({ length: 7 }, (_, index) =>
      pool.run(async () => {
        started.push(index)
        await new Promise<void>((resolve) => {
          finish[index] = resolve
        })
        if (index === 0) throw new Error("failed request")
        return index
      }),
    )
    const all = Promise.allSettled(requests)
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]))
    finish[0]!()
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4, 5]))
    finish[1]!()
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4, 5, 6]))
    finish.slice(2).forEach((resolve) => resolve())
    expect((await all).filter((result) => result.status === "fulfilled")).toHaveLength(6)
    await expect(pool.run(async () => "available")).resolves.toBe("available")
  })
})
