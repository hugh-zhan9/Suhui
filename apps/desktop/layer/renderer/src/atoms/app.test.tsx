import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { jotaiStore } from "~/lib/jotai"

import {
  createInitialStartupReadinessState,
  setStartupReadiness,
  type StartupReadinessState,
  useStartupReadinessSelector,
} from "./app"

const ReadinessProbe = <T,>({
  selector,
  onRender,
}: {
  selector: (state: StartupReadinessState) => T
  onRender: (value: T) => void
}) => {
  onRender(useStartupReadinessSelector(selector))
  return null
}

describe("startup readiness selectors", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    setStartupReadiness(createInitialStartupReadinessState())
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })

  it("does not rerender a shell-ready consumer for unrelated readiness updates", async () => {
    const values: boolean[] = []
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <ReadinessProbe
            selector={(state) => state.shellReady}
            onRender={(value) => values.push(value)}
          />
        </Provider>,
      ),
    )
    await act(async () => {})
    const initialRenderCount = values.length
    expect(values.every((value) => value === false)).toBe(true)

    await act(async () => setStartupReadiness((state) => ({ ...state, routeScopeReady: true })))
    expect(values).toHaveLength(initialRenderCount)

    await act(async () => setStartupReadiness((state) => ({ ...state, shellReady: true })))
    expect(values).toHaveLength(initialRenderCount + 1)
    expect(values.at(-1)).toBe(true)
  })

  it("rerenders route and initial-entry consumers only when their selected field changes", async () => {
    const routeValues: boolean[] = []
    const entryValues: boolean[] = []
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <ReadinessProbe
            selector={(state) => state.routeScopeReady}
            onRender={(value) => routeValues.push(value)}
          />
          <ReadinessProbe
            selector={(state) => state.desktopInitialEntriesReady}
            onRender={(value) => entryValues.push(value)}
          />
        </Provider>,
      ),
    )
    await act(async () => {})
    const initialRouteRenderCount = routeValues.length
    const initialEntryRenderCount = entryValues.length

    await act(async () => setStartupReadiness((state) => ({ ...state, dbUsable: true })))
    expect(routeValues).toHaveLength(initialRouteRenderCount)
    expect(entryValues).toHaveLength(initialEntryRenderCount)

    await act(async () => setStartupReadiness((state) => ({ ...state, routeScopeReady: true })))
    expect(routeValues).toHaveLength(initialRouteRenderCount + 1)
    expect(routeValues.at(-1)).toBe(true)
    expect(entryValues).toHaveLength(initialEntryRenderCount)

    await act(async () =>
      setStartupReadiness((state) => ({ ...state, desktopInitialEntriesReady: true })),
    )
    expect(routeValues).toHaveLength(initialRouteRenderCount + 1)
    expect(entryValues).toHaveLength(initialEntryRenderCount + 1)
    expect(entryValues.at(-1)).toBe(true)
  })
})
