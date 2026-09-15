import { expect, it } from "vitest"

import { runFeedOperation } from "./operation"

it("serializes one feed across refresh/history but lets other feeds progress and releases after errors", async () => {
  let release!: () => void
  const events: string[] = []
  const first = runFeedOperation("f1", async () => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    events.push("first")
    throw new Error("failed")
  })
  const failure = expect(first).rejects.toThrow("failed")
  const second = runFeedOperation("f1", async () => {
    events.push("second")
  })
  await runFeedOperation("f2", async () => {
    events.push("other")
  })
  expect(events).toEqual(["other"])
  release()
  await failure
  await second
  expect(events).toEqual(["other", "first", "second"])
})
