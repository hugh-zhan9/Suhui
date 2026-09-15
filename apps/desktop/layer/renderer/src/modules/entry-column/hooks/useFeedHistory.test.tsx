import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { useFeedHistory } from "./useFeedHistory"

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("~/lib/client", () => ({ ipcServices: { db: { loadFeedHistory: mocks.load } } }))
let root: Root
let container: HTMLDivElement
let current: ReturnType<typeof useFeedHistory>
const loaded = vi.fn()
const Harness = ({ feedId }: { feedId?: string }) => {
  current = useFeedHistory(feedId, loaded)
  return null
}
const render = async (feedId?: string) => {
  await act(async () => {
    root.render(<Harness feedId={feedId} />)
  })
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  mocks.load.mockReset()
  loaded.mockReset()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

it("coalesces repeated triggers and stops after completion", async () => {
  let resolve!: (value: unknown) => void
  mocks.load.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  await render("f1")
  let request!: Promise<void>
  await act(async () => {
    request = current.loadMore()
    void current.loadMore()
  })
  expect(mocks.load).toHaveBeenCalledTimes(1)
  expect(current.loading).toBe(true)
  await act(async () => {
    resolve({ added: 3, status: "complete" })
    await request
  })
  expect(loaded).toHaveBeenCalledTimes(1)
  await act(async () => {
    await current.loadMore()
  })
  expect(mocks.load).toHaveBeenCalledTimes(1)
})
it("stops automatic retries after failure and only retries explicitly", async () => {
  mocks.load
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ added: 0, status: "complete" })
  await render("f1")
  await act(async () => {
    await current.loadMore()
    await current.loadMore()
  })
  expect(current.error).toBe("offline")
  expect(mocks.load).toHaveBeenCalledTimes(1)
  await act(async () => {
    await current.loadMore(true)
  })
  expect(current.error).toBeNull()
  expect(mocks.load).toHaveBeenCalledTimes(2)
})
it("ignores a stale response after switching subscriptions", async () => {
  let resolve!: (value: unknown) => void
  mocks.load.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  await render("f1")
  let request!: Promise<void>
  await act(async () => {
    request = current.loadMore()
  })
  await render("f2")
  await act(async () => {
    resolve({ added: 10, status: "complete" })
    await request
  })
  expect(current.feedId).toBe("f2")
  expect(current.status).toBe("more")
  expect(loaded).not.toHaveBeenCalled()
})
it("retries the list reload after data was committed but the first reload failed", async () => {
  mocks.load
    .mockResolvedValueOnce({ added: 10, status: "complete" })
    .mockResolvedValue({ added: 0, status: "complete" })
  loaded.mockRejectedValueOnce(new Error("query failed")).mockImplementation(async () => {})
  await render("f1")
  await act(async () => {
    await current.loadMore()
  })
  expect(current.error).toBe("query failed")
  await act(async () => {
    await current.loadMore(true)
  })
  expect(loaded).toHaveBeenCalledTimes(2)
  expect(current.status).toBe("complete")
  expect(current.error).toBeNull()
})
it("does not request outside a single subscribed desktop feed", async () => {
  await render()
  await act(async () => {
    await current.loadMore()
  })
  expect(mocks.load).not.toHaveBeenCalled()
})

it("can load again after A to B to A while the old A request was in flight", async () => {
  let resolve!: (value: unknown) => void
  mocks.load
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    .mockResolvedValue({ added: 0, status: "complete" })
  await render("f1")
  let first!: Promise<void>
  await act(async () => {
    first = current.loadMore()
  })
  await render("f2")
  await render("f1")
  expect(current.loading).toBe(false)
  await act(async () => {
    resolve({ added: 3, status: "complete" })
    await first
  })
  expect(current.status).toBe("more")
  await act(async () => {
    await current.loadMore()
  })
  expect(mocks.load).toHaveBeenCalledTimes(2)
  expect(current.status).toBe("complete")
  expect(loaded).toHaveBeenCalledTimes(1)
})
