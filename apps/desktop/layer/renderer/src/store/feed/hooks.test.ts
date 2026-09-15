import { getSubscriptionByFeedId } from "@suhui/store/subscription/getter"
import { expect, it, vi } from "vitest"

import { getPreferredTitle } from "./hooks"

vi.mock("@suhui/store/subscription/getter", () => ({ getSubscriptionByFeedId: vi.fn() }))

it("decodes a stored feed title for sidebar and header without requiring a refresh", () => {
  expect(getPreferredTitle({ id: "feed-1", type: "feed", title: "Lynan&#39;s Page" })).toBe(
    "Lynan's Page",
  )
})

it("preserves a user's custom subscription title", () => {
  vi.mocked(getSubscriptionByFeedId).mockReturnValueOnce({
    title: "Literal &#39; example",
  } as NonNullable<ReturnType<typeof getSubscriptionByFeedId>>)
  expect(getPreferredTitle({ id: "feed-1", type: "feed", title: "Lynan&#39;s Page" })).toBe(
    "Literal &#39; example",
  )
})

it("preserves inbox and list naming", () => {
  expect(getPreferredTitle({ id: "demo", type: "inbox" })).toBe("Demo's Inbox")
  expect(getPreferredTitle({ id: "list-1", type: "list", title: "Literal &amp;" })).toBe(
    "Literal &amp;",
  )
})
