import { FeedViewType } from "@suhui/constants"
import { createSidebarSubscriptionSelector } from "@suhui/store/subscription/hooks"
import type { SubscriptionState } from "@suhui/store/subscription/store"
import { describe, expect, it } from "vitest"

import {
  createSidebarTitleSortKey,
  deriveSidebarModel,
  type SidebarDerivedInput,
} from "./sidebar-derived-model"

const fixture = (count: number): SidebarDerivedInput => {
  const subscriptionIds = Array.from({ length: count }, (_, index) => `feed-${index}`)
  return {
    subscriptionIds,
    categoryBySubscriptionId: Object.fromEntries(
      subscriptionIds.map((id, index) => [id, `category-${Math.floor(index / 10)}`]),
    ),
    titleBySubscriptionId: Object.fromEntries(
      subscriptionIds.map((id, index) => [id, `Title ${String(index).padStart(4, "0")}`]),
    ),
    unreadBySubscriptionId: Object.fromEntries(subscriptionIds.map((id, index) => [id, index % 7])),
    collapsedCategories: new Set(["category-1"]),
    sortMode: "unread",
    sortDirection: "desc",
  }
}

describe("deriveSidebarModel", () => {
  it.each([400, 800])(
    "derives deterministic grouped unread totals for %i subscriptions",
    (count) => {
      const input = fixture(count)
      const result = deriveSidebarModel(input)

      expect(result).toHaveLength(count / 10)
      expect(result.reduce((total, category) => total + category.subscriptionIds.length, 0)).toBe(
        count,
      )
      expect(result.reduce((total, category) => total + category.unread, 0)).toBe(
        Object.values(input.unreadBySubscriptionId).reduce((total, unread) => total + unread, 0),
      )
      expect(result.find((category) => category.category === "category-1")?.collapsed).toBe(true)
    },
  )

  it("preserves unread direction and the current feed/category tie behavior", () => {
    const base: SidebarDerivedInput = {
      subscriptionIds: ["feed-b", "feed-a", "feed-c", "feed-d"],
      categoryBySubscriptionId: {
        "feed-a": "first",
        "feed-b": "first",
        "feed-c": "second",
        "feed-d": "second",
      },
      titleBySubscriptionId: {},
      unreadBySubscriptionId: { "feed-a": 2, "feed-b": 2, "feed-c": 2, "feed-d": 2 },
      collapsedCategories: new Set(),
      sortMode: "unread",
      sortDirection: "desc",
    }

    const desc = deriveSidebarModel(base)
    expect(desc.map((category) => category.category)).toEqual(["first", "second"])
    expect(desc[0]?.subscriptionIds).toEqual(["feed-a", "feed-b"])

    const asc = deriveSidebarModel({ ...base, sortDirection: "asc" })
    expect(asc.map((category) => category.category)).toEqual(["second", "first"])
    expect(asc[1]?.subscriptionIds).toEqual(["feed-a", "feed-b"])
  })

  it("preserves alphabetical direction and promotes onboarding only in alphabetical mode", () => {
    const base: SidebarDerivedInput = {
      subscriptionIds: ["charlie", "onboarding", "alpha"],
      categoryBySubscriptionId: { charlie: "feeds", onboarding: "feeds", alpha: "feeds" },
      titleBySubscriptionId: {
        alpha: "Alpha",
        charlie: "Charlie",
        onboarding: createSidebarTitleSortKey("Welcome", true),
      },
      unreadBySubscriptionId: { alpha: 3, charlie: 2, onboarding: 1 },
      collapsedCategories: new Set(),
      sortMode: "alphabetical",
      sortDirection: "desc",
    }

    expect(deriveSidebarModel(base)[0]?.subscriptionIds).toEqual(["onboarding", "alpha", "charlie"])
    expect(deriveSidebarModel({ ...base, sortDirection: "asc" })[0]?.subscriptionIds).toEqual([
      "onboarding",
      "charlie",
      "alpha",
    ])
    expect(deriveSidebarModel({ ...base, sortMode: "unread" })[0]?.subscriptionIds).toEqual([
      "alpha",
      "charlie",
      "onboarding",
    ])
  })

  it.each([
    ["desc", ["alpha", "charlie", "bravo"]],
    ["asc", ["bravo", "charlie", "alpha"]],
  ] as const)(
    "preserves alphabetical %s category tie behavior for duplicate display titles",
    (sortDirection, expected) => {
      const input: SidebarDerivedInput = {
        subscriptionIds: ["alpha", "bravo", "charlie"],
        categoryBySubscriptionId: {
          alpha: "category-a",
          bravo: "category-b",
          charlie: "category-c",
        },
        titleBySubscriptionId: {
          alpha: "Duplicate",
          bravo: "Zulu",
          charlie: "Duplicate",
        },
        unreadBySubscriptionId: {},
        collapsedCategories: new Set(),
        sortMode: "alphabetical",
        sortDirection,
      }

      expect(deriveSidebarModel(input).flatMap((category) => category.subscriptionIds)).toEqual(
        expected,
      )
    },
  )

  it.each([
    ["desc", ["alpha", "charlie", "bravo"]],
    ["asc", ["bravo", "charlie", "alpha"]],
  ] as const)(
    "preserves alphabetical %s feed tie behavior for duplicate display titles",
    (sortDirection, expected) => {
      const input: SidebarDerivedInput = {
        subscriptionIds: ["alpha", "bravo", "charlie"],
        categoryBySubscriptionId: {
          alpha: "shared",
          bravo: "shared",
          charlie: "shared",
        },
        titleBySubscriptionId: {
          alpha: "Duplicate",
          bravo: "Zulu",
          charlie: "Duplicate",
        },
        unreadBySubscriptionId: {},
        collapsedCategories: new Set(),
        sortMode: "alphabetical",
        sortDirection,
      }

      expect(deriveSidebarModel(input)[0]?.subscriptionIds).toEqual(expected)
    },
  )

  it("groups prototype-named categories without collisions", () => {
    const categories = ["__proto__", "constructor", "toString"]
    const subscriptionIds = categories.map((_, index) => `feed-${index}`)
    const categoryBySubscriptionId = Object.fromEntries(
      subscriptionIds.map((id, index) => [id, categories[index]!]),
    )

    const result = deriveSidebarModel({
      subscriptionIds,
      categoryBySubscriptionId,
      titleBySubscriptionId: Object.fromEntries(subscriptionIds.map((id) => [id, id])),
      unreadBySubscriptionId: Object.fromEntries(subscriptionIds.map((id) => [id, 1])),
      collapsedCategories: new Set(categories),
      sortMode: "unread",
      sortDirection: "desc",
    })

    expect(result.map((category) => category.category)).toEqual(categories)
    expect(result.map((category) => category.subscriptionIds)).toEqual(
      subscriptionIds.map((id) => [id]),
    )
    expect(result.every((category) => category.collapsed)).toBe(true)
  })

  it("retains top-level, category, and feed-array identity for equal selected inputs", () => {
    const input = fixture(400)
    const first = deriveSidebarModel(input)
    const second = deriveSidebarModel({
      ...input,
      categoryBySubscriptionId: { ...input.categoryBySubscriptionId, unrelated: "elsewhere" },
      titleBySubscriptionId: { ...input.titleBySubscriptionId, unrelated: "Elsewhere" },
      unreadBySubscriptionId: { ...input.unreadBySubscriptionId, unrelated: 99 },
    })

    expect(second).toBe(first)
    expect(second[0]).toBe(first[0])
    expect(second[0]?.subscriptionIds).toBe(first[0]?.subscriptionIds)
  })

  it("rebuilds only the category whose selected unread value changed", () => {
    const input = fixture(400)
    const first = deriveSidebarModel(input)
    const changedId = first[0]!.subscriptionIds[0]!
    const changed = deriveSidebarModel({
      ...input,
      unreadBySubscriptionId: {
        ...input.unreadBySubscriptionId,
        [changedId]: (input.unreadBySubscriptionId[changedId] ?? 0) + 100,
      },
    })
    const unchangedCategory = first.find((category) => category.category === "category-1")!

    expect(changed).not.toBe(first)
    expect(
      changed.find((category) => category.category === first[0]?.category)?.subscriptionIds,
    ).toBe(first[0]?.subscriptionIds)
    expect(changed.find((category) => category.category === unchangedCategory.category)).toBe(
      unchangedCategory,
    )
  })
})

describe("createSidebarSubscriptionSelector", () => {
  it("projects prototype-named categories into collision-safe records", () => {
    const categories = ["__proto__", "constructor", "toString"]
    const feedIds = categories.map((_, index) => `feed-${index}`)
    const data = Object.fromEntries(
      feedIds.map((feedId, index) => [
        feedId,
        {
          feedId,
          type: "feed",
          view: FeedViewType.All,
          category: categories[index],
          title: `Title ${index}`,
        },
      ]),
    )
    const state = {
      data,
      feedIdByView: { [FeedViewType.All]: new Set(feedIds) },
    } as unknown as SubscriptionState

    const selection = createSidebarSubscriptionSelector(FeedViewType.All, false)(state)

    expect(Object.getPrototypeOf(selection.groups)).toBeNull()
    expect(Object.getPrototypeOf(selection.categoryBySubscriptionId)).toBeNull()
    expect(Object.keys(selection.groups)).toEqual(categories)
    expect(categories.map((category) => selection.groups[category])).toEqual(
      feedIds.map((feedId) => [feedId]),
    )
  })
})
