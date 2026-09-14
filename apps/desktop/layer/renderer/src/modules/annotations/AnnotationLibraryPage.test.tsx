import type {
  AnnotationLibraryItem,
  AnnotationLibraryPage as LibraryPage,
} from "@suhui/shared/annotations"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AnnotationLibraryPage } from "./AnnotationLibraryPage"

const { listLibrary, navigateEntry } = vi.hoisted(() => ({
  listLibrary: vi.fn(),
  navigateEntry: vi.fn(),
}))
vi.mock("~/lib/local-reading-ipc", () => ({
  localReadingIpc: () => ({ listAnnotationLibrary: listLibrary }),
}))
vi.mock("~/hooks/biz/useNavigateEntry", () => ({
  useNavigateEntry: vi.fn().mockReturnValue(navigateEntry),
}))
vi.mock("~/modules/app-layout/subview/hooks", () => ({ useSubViewTitle: vi.fn() }))
vi.mock("@suhui/components/ui/button/index.js", () => ({
  Button: ({ children, variant: _variant, size: _size, buttonClassName, ...props }: any) => (
    <button type="button" className={buttonClassName} {...props}>
      {children}
    </button>
  ),
}))

const item = (overrides: Partial<AnnotationLibraryItem> = {}): AnnotationLibraryItem => ({
  id: "n1",
  kind: "note",
  content: "阅读后的想法",
  entryId: "e1",
  updatedAt: 1000,
  source: null,
  status: null,
  articleId: "e1",
  articleTitle: "文章标题",
  feedId: "f1",
  feedTitle: "订阅源",
  ...overrides,
})
const page = (items: AnnotationLibraryItem[]): LibraryPage => ({ items, nextCursor: null })

describe("AnnotationLibraryPage", () => {
  let container: HTMLDivElement
  let root: Root
  let client: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    listLibrary.mockReset()
    vi.stubGlobal("window", document.defaultView)
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
    vi.unstubAllGlobals()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })

  const render = () =>
    act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <AnnotationLibraryPage />
        </QueryClientProvider>,
      ),
    )
  const settle = async () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  const click = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === label,
    )
    expect(button, label).toBeDefined()
    await act(async () => button!.click())
    await settle()
  }

  it("shows content, source, orphan status and opens the original article with a return path", async () => {
    listLibrary.mockResolvedValue(
      page([
        item(),
        item({
          id: "h1",
          kind: "highlight",
          content: "值得记住的摘录",
          source: "readability",
          status: "orphaned",
          articleId: null,
        }),
      ]),
    )
    await render()
    await settle()
    expect(container.textContent).toContain("阅读后的想法")
    expect(container.querySelector("blockquote")?.textContent).toBe("值得记住的摘录")
    expect(container.textContent).toContain("净化正文")
    expect(container.textContent).toContain("锚点待确认")
    expect(container.textContent).toContain("文章已不可用")
    expect(container.textContent).toContain("订阅源")
    expect(
      Array.from(container.querySelectorAll("button")).filter(
        (button) => button.textContent === "打开文章",
      ),
    ).toHaveLength(1)
    await click("打开文章")
    expect(navigateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "e1", feedId: "f1", backPath: "/annotations" }),
    )
  })

  it("explains where to create records when empty and filters at the query boundary", async () => {
    listLibrary.mockResolvedValue(page([]))
    await render()
    await settle()
    expect(container.textContent).toContain("还没有笔记或高亮")
    await click("笔记")
    expect(listLibrary).toHaveBeenLastCalledWith({ kind: "note", cursor: undefined, limit: 50 })
    expect(container.textContent).toContain("还没有笔记")
    await click("高亮")
    expect(listLibrary).toHaveBeenLastCalledWith({
      kind: "highlight",
      cursor: undefined,
      limit: 50,
    })
    expect(container.textContent).toContain("还没有高亮")
  })

  it("appends the next page and stops at the end", async () => {
    const cursor = { id: "n1", updatedAt: 1000, kind: "note" as const }
    listLibrary
      .mockResolvedValueOnce({ items: [item()], nextCursor: cursor })
      .mockResolvedValueOnce(page([item({ id: "n2", content: "更早的记录" })]))
    await render()
    await settle()
    await click("加载更多")
    expect(listLibrary).toHaveBeenLastCalledWith({ kind: undefined, cursor, limit: 50 })
    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(container.textContent).toContain("更早的记录")
    expect(container.textContent).not.toContain("加载更多")
  })

  it("does not mix a late response into a different filter", async () => {
    let resolveOld!: (value: LibraryPage) => void
    listLibrary
      .mockReturnValueOnce(
        new Promise<LibraryPage>((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockResolvedValue(page([item({ id: "h1", kind: "highlight", content: "当前高亮" })]))
    await render()
    expect(container.textContent).toContain("正在加载记录")
    await click("高亮")
    await act(async () => resolveOld(page([item({ content: "旧筛选结果" })])))
    await settle()
    expect(container.textContent).toContain("当前高亮")
    expect(container.textContent).not.toContain("旧筛选结果")
  })

  it("reports a load failure without disguising it as an empty library", async () => {
    listLibrary.mockRejectedValueOnce(new Error("数据库暂不可用")).mockResolvedValue(page([item()]))
    await render()
    await settle()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("数据库暂不可用")
    expect(container.textContent).not.toContain("还没有笔记或高亮")
    expect(listLibrary).toHaveBeenCalledTimes(1)
    await click("重新加载")
    expect(container.textContent).toContain("阅读后的想法")
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it("keeps the first page after a next-page failure and retries that cursor", async () => {
    const cursor = { id: "n1", updatedAt: 1000, kind: "note" as const }
    listLibrary
      .mockResolvedValueOnce({ items: [item()], nextCursor: cursor })
      .mockRejectedValueOnce(new Error("读取失败"))
      .mockResolvedValueOnce(page([item({ id: "n2" })]))
    await render()
    await settle()
    await click("加载更多")
    expect(container.querySelectorAll("li")).toHaveLength(1)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    await click("重新加载")
    expect(listLibrary).toHaveBeenLastCalledWith({ kind: undefined, cursor, limit: 50 })
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  it("refreshes cached records when returning from an article", async () => {
    listLibrary.mockResolvedValueOnce(page([item()])).mockResolvedValue(page([]))
    await render()
    await settle()
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <div>文章</div>
        </QueryClientProvider>,
      ),
    )
    await render()
    await settle()
    expect(listLibrary).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toContain("阅读后的想法")
  })
})
