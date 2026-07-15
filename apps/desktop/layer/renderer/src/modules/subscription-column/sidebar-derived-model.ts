import { sortByAlphabet } from "@suhui/utils/utils"

export type SidebarSortMode = "unread" | "alphabetical"
export type SidebarSortDirection = "asc" | "desc"

export type SidebarDerivedInput = {
  subscriptionIds: readonly string[]
  categoryBySubscriptionId: Readonly<Record<string, string | null>>
  titleBySubscriptionId: Readonly<Record<string, string>>
  unreadBySubscriptionId: Readonly<Record<string, number>>
  collapsedCategories: ReadonlySet<string>
  sortMode: SidebarSortMode
  sortDirection: SidebarSortDirection
}

export type SidebarDerivedCategory = {
  category: string | null
  subscriptionIds: readonly string[]
  unread: number
  collapsed: boolean
}

const onboardingTitlePrefix = "\u0000sidebar-onboarding\u0000"

export const createSidebarTitleSortKey = (title: string, onboarding: boolean) =>
  onboarding ? `${onboardingTitlePrefix}${title}` : title

const decodeTitle = (title: string | undefined) => {
  const value = title ?? ""
  return value.startsWith(onboardingTitlePrefix)
    ? { onboarding: true, title: value.slice(onboardingTitlePrefix.length) }
    : { onboarding: false, title: value }
}

type WorkingCategory = {
  category: string | null
  index: number
  ids: string[]
  unread: number
  onboarding: boolean
}

const categoryCacheKey = (category: string | null) =>
  category === null ? "\u0000sidebar-null-category" : `category:${category}`

const equalIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])

const orderIds = (ids: string[], input: SidebarDerivedInput) => {
  const compareAlphabetically = (left: string, right: string) =>
    sortByAlphabet(
      decodeTitle(input.titleBySubscriptionId[left]).title,
      decodeTitle(input.titleBySubscriptionId[right]).title,
    )

  if (input.sortMode === "unread") {
    return ids.sort((left, right) => {
      const unreadCompare =
        (input.unreadBySubscriptionId[right] ?? 0) - (input.unreadBySubscriptionId[left] ?? 0)
      if (unreadCompare !== 0) {
        return input.sortDirection === "desc" ? unreadCompare : -unreadCompare
      }
      return left.localeCompare(right)
    })
  }

  const onboarding: string[] = []
  const regular: string[] = []
  for (const id of ids) {
    ;(decodeTitle(input.titleBySubscriptionId[id]).onboarding ? onboarding : regular).push(id)
  }

  const orderPartition = (partition: string[]) => {
    partition.sort(compareAlphabetically)
    return input.sortDirection === "desc" ? partition : partition.reverse()
  }
  return [...orderPartition(onboarding), ...orderPartition(regular)]
}

export const createSidebarModelDeriver = () => {
  let previousByCategory = new Map<string, SidebarDerivedCategory>()
  let previousResult: readonly SidebarDerivedCategory[] = []

  return (input: SidebarDerivedInput): readonly SidebarDerivedCategory[] => {
    const grouped = new Map<string | null, WorkingCategory>()

    for (const id of input.subscriptionIds) {
      const category = input.categoryBySubscriptionId[id] ?? null
      let group = grouped.get(category)
      if (!group) {
        group = { category, index: grouped.size, ids: [], unread: 0, onboarding: false }
        grouped.set(category, group)
      }
      group.ids.push(id)
      group.unread += input.unreadBySubscriptionId[id] ?? 0
      group.onboarding ||= decodeTitle(input.titleBySubscriptionId[id]).onboarding
    }

    const categories = Array.from(grouped.values())
    if (input.sortMode === "unread") {
      categories.sort((left, right) => {
        const unreadCompare = right.unread - left.unread
        return unreadCompare || left.index - right.index
      })
      if (input.sortDirection === "asc") categories.reverse()
    } else {
      const categoryTitle = (group: WorkingCategory) =>
        group.ids.length === 1
          ? decodeTitle(input.titleBySubscriptionId[group.ids[0]!]).title
          : (group.category ?? decodeTitle(input.titleBySubscriptionId[group.ids[0]!]).title)
      const onboarding = categories.filter((category) => category.onboarding)
      const regular = categories.filter((category) => !category.onboarding)
      const orderPartition = (partition: WorkingCategory[]) => {
        partition.sort((left, right) => sortByAlphabet(categoryTitle(left), categoryTitle(right)))
        return input.sortDirection === "desc" ? partition : partition.reverse()
      }
      categories.splice(
        0,
        categories.length,
        ...orderPartition(onboarding),
        ...orderPartition(regular),
      )
    }

    const nextByCategory = new Map<string, SidebarDerivedCategory>()
    const result = categories.map((working) => {
      const subscriptionIds = orderIds(working.ids, input)
      const collapsed = working.category !== null && input.collapsedCategories.has(working.category)
      const key = categoryCacheKey(working.category)
      const previous = previousByCategory.get(key)
      const stableSubscriptionIds =
        previous && equalIds(previous.subscriptionIds, subscriptionIds)
          ? previous.subscriptionIds
          : subscriptionIds
      const next =
        previous &&
        previous.unread === working.unread &&
        previous.collapsed === collapsed &&
        stableSubscriptionIds === previous.subscriptionIds
          ? previous
          : {
              category: working.category,
              subscriptionIds: stableSubscriptionIds,
              unread: working.unread,
              collapsed,
            }
      nextByCategory.set(key, next)
      return next
    })

    const stableResult =
      result.length === previousResult.length &&
      result.every((category, index) => category === previousResult[index])
        ? previousResult
        : result
    previousByCategory = nextByCategory
    previousResult = stableResult
    return stableResult
  }
}

export const deriveSidebarModel = createSidebarModelDeriver()
