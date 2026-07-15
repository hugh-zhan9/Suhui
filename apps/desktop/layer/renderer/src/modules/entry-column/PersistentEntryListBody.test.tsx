import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PersistentEntryListBody } from "./PersistentEntryListBody"

describe("PersistentEntryListBody", () => {
  let container: HTMLDivElement
  let root: Root
  let mounts: number
  let unmounts: number

  const MockList = ({ entriesIds }: { entriesIds: string[] }) => {
    useEffect(() => {
      mounts++
      return () => {
        unmounts++
      }
    }, [])
    return <div data-testid="list">{entriesIds.join(",")}</div>
  }

  const render = async (entriesIds: string[], isLoading: boolean) => {
    await act(async () =>
      root.render(
        <PersistentEntryListBody
          entriesIds={entriesIds}
          isLoading={isLoading}
          loadingFallback={<div data-testid="skeleton" />}
          emptyFallback={<div data-testid="empty" />}
        >
          <MockList entriesIds={entriesIds} />
        </PersistentEntryListBody>,
      ),
    )
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mounts = 0
    unmounts = 0
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })

  it("keeps the list mounted while loading and empty fallbacks change", async () => {
    await render([], true)
    expect(container.querySelector('[data-testid="list"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="skeleton"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="empty"]')).toBeNull()

    await render(["entry-1"], false)
    expect(mounts).toBe(1)
    expect(unmounts).toBe(0)
    expect(container.querySelector('[data-testid="skeleton"]')).toBeNull()
    expect(container.querySelector('[data-testid="list"]')?.textContent).toBe("entry-1")

    await render([], false)
    expect(mounts).toBe(1)
    expect(unmounts).toBe(0)
    expect(container.querySelector('[data-testid="empty"]')).not.toBeNull()
  })
})
