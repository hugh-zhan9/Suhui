import { describe, expect, it } from "vitest"

import { collectCleanupTargets } from "./subscription"

describe("collectCleanupTargets", () => {
  it("应按订阅类型聚合并去重 feed/list/inbox 清理目标", () => {
    const result = collectCleanupTargets([
      { type: "feed", feedId: "feed-1", listId: null, inboxId: null },
      { type: "feed", feedId: "feed-1", listId: null, inboxId: null },
      { type: "list", feedId: null, listId: "list-1", inboxId: null },
      { type: "inbox", feedId: null, listId: null, inboxId: "inbox-1" },
    ])

    expect(result.feedIds).toEqual(["feed-1"])
    expect(result.listIds).toEqual(["list-1"])
    expect(result.inboxIds).toEqual(["inbox-1"])
  })
})

