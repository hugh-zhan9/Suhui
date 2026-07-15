import { createEntryChangeEventV1 } from "@suhui/shared/entry-change"
import { describe, expect, it, vi } from "vitest"

import { syncLocalFeedRefreshCompleted } from "./local-feed-refresh-sync"

const createChangeSet = (source: string) =>
  createEntryChangeEventV1({
    batchId: `batch-${source}`,
    reason: "refresh",
    source,
    scope: "feeds",
    feedIds: ["feed_1"],
    refreshed: 1,
    failed: 0,
    completedAt: 123,
  })

describe("syncLocalFeedRefreshCompleted", () => {
  it.each(["manual-single", "manual-batch", "startup-auto", "interval-auto"])(
    "routes %s events through the shared coordinator",
    async (source) => {
      const payload = createChangeSet(source)
      const handleChange = vi.fn().mockResolvedValue("handled")

      await expect(syncLocalFeedRefreshCompleted({ payload, handleChange })).resolves.toBe(
        "handled",
      )

      expect(handleChange).toHaveBeenCalledOnce()
      expect(handleChange).toHaveBeenCalledWith(payload, "ipc")
    },
  )

  it("lets the coordinator reject malformed event payloads", async () => {
    const handleChange = vi.fn().mockResolvedValue("ignored-invalid")

    await expect(
      syncLocalFeedRefreshCompleted({
        payload: { source: "startup-auto", feedIds: ["feed_1"] },
        handleChange,
      }),
    ).resolves.toBe("ignored-invalid")

    expect(handleChange).toHaveBeenCalledWith(
      { source: "startup-auto", feedIds: ["feed_1"] },
      "ipc",
    )
  })
})
