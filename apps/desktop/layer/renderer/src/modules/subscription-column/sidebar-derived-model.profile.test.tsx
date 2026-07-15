import { act } from "react"
import { memo, Profiler, type ProfilerOnRenderCallback } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import {
  deriveSidebarModel,
  type SidebarDerivedCategory,
  type SidebarDerivedInput,
} from "./sidebar-derived-model"

type RenderCounters = { categories: number; rows: number }

let counters: RenderCounters = { categories: 0, rows: 0 }

const ProfileRow = memo(function ProfileRow({ id }: { id: string }) {
  counters.rows++
  return <span>{id}</span>
})

const ProfileCategory = memo(function ProfileCategory({
  category,
}: {
  category: SidebarDerivedCategory
}) {
  counters.categories++
  return (
    <section>
      {category.subscriptionIds.map((id) => (
        <ProfileRow key={id} id={id} />
      ))}
    </section>
  )
})

const ProfileSidebar = ({ model }: { model: readonly SidebarDerivedCategory[] }) => (
  <div>
    {model.map((category) => (
      <ProfileCategory key={category.category} category={category} />
    ))}
  </div>
)

const createFixture = (count: number): SidebarDerivedInput => {
  const subscriptionIds = Array.from({ length: count }, (_, index) => `feed-${index}`)
  return {
    subscriptionIds,
    categoryBySubscriptionId: Object.fromEntries(
      subscriptionIds.map((id, index) => [id, `category-${Math.floor(index / 10)}`]),
    ),
    titleBySubscriptionId: Object.fromEntries(subscriptionIds.map((id) => [id, id])),
    unreadBySubscriptionId: Object.fromEntries(subscriptionIds.map((id) => [id, 1])),
    collapsedCategories: new Set(),
    sortMode: "unread",
    sortDirection: "desc",
  }
}

const cloneModel = (model: readonly SidebarDerivedCategory[]) =>
  model.map((category) => ({ ...category, subscriptionIds: category.subscriptionIds.concat() }))

const runScenario = async (count: number, stable: boolean) => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const durations: number[] = []
  let mountDurationMs = 0
  const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
    if (phase === "mount") mountDurationMs = actualDuration
    else durations.push(actualDuration)
  }
  const input = createFixture(count)
  const selectModel = (next: SidebarDerivedInput) => {
    const derived = deriveSidebarModel(next)
    return stable ? derived : cloneModel(derived)
  }

  counters = { categories: 0, rows: 0 }
  await act(async () => {
    root.render(
      <Profiler id="sidebar" onRender={onRender}>
        <ProfileSidebar model={selectModel(input)} />
      </Profiler>,
    )
  })
  const initial = { ...counters, durationMs: mountDurationMs }

  counters = { categories: 0, rows: 0 }
  await act(async () => {
    root.render(
      <Profiler id="sidebar" onRender={onRender}>
        <ProfileSidebar
          model={selectModel({
            ...input,
            unreadBySubscriptionId: { ...input.unreadBySubscriptionId, unrelated: 100 },
          })}
        />
      </Profiler>,
    )
  })
  const unrelatedUpdate = { ...counters, durationMs: durations.at(-1) ?? 0 }

  counters = { categories: 0, rows: 0 }
  await act(async () => {
    root.render(
      <Profiler id="sidebar" onRender={onRender}>
        <ProfileSidebar
          model={selectModel({
            ...input,
            unreadBySubscriptionId: { ...input.unreadBySubscriptionId, "feed-0": 100 },
          })}
        />
      </Profiler>,
    )
  })
  const selectedUpdate = { ...counters, durationMs: durations.at(-1) ?? 0 }

  await act(async () => root.unmount())
  container.remove()
  return { initial, unrelatedUpdate, selectedUpdate }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("sidebar derived model React profile", () => {
  it.each([400, 800])(
    "profiles rebuild-all and stable paths for %i subscriptions",
    async (count) => {
      const before = await runScenario(count, false)
      const final = await runScenario(count, true)

      console.info("SIDEBAR_PROFILE", JSON.stringify({ count, before, final }))
      expect(final.unrelatedUpdate.categories).toBe(0)
      expect(final.unrelatedUpdate.rows).toBe(0)
      expect(final.selectedUpdate.categories).toBe(1)
      expect(before.unrelatedUpdate.categories).toBe(count / 10)
    },
  )
})
