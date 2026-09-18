import { parseHtmlToHast } from "@suhui/utils/html"
import type { Root } from "hast"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildBilingualHtml } from "~/lib/bilingual-html"
import { htmlParserClient } from "~/lib/html-parser-client"

import { HTML } from "./HTML"
import { TranslationRetryContext } from "./TranslationRetry"

const testTheme = vi.hoisted(() => ({ dark: false }))
vi.mock("@suhui/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@suhui/hooks")>()),
  useIsDark: () => testTheme.dark,
}))

vi.mock("~/lib/html-parser-client", () => ({
  htmlParserClient: { parse: vi.fn(), getCached: vi.fn() },
}))
vi.mock("~/providers/wrapped-element-provider", () => ({
  useWrappedElementSize: () => ({ w: 700 }),
}))
vi.mock("../media/MediaContainerWidthProvider", () => ({
  MediaContainerWidthProvider: ({ children }) => children,
}))
vi.mock("../media/MediaInfoRecordProvider", () => ({
  MediaInfoRecordProvider: ({ children }) => children,
}))

const source =
  '<p>First <strong>paragraph</strong></p><p>Second paragraph</p><iframe title="media"></iframe>'
const partial = buildBilingualHtml(source, source.replace("Second paragraph", "第二段"))
const complete = buildBilingualHtml(
  source,
  source.replace("First", "第一").replace("Second paragraph", "第二段"),
)
let pending: Map<string, (tree: Root) => void>
const finish = async (content: string) => {
  await act(async () =>
    pending.get(content)!(parseHtmlToHast(content, { renderInlineStyle: true })),
  )
}

describe("progressive article HTML", () => {
  beforeEach(() => {
    testTheme.dark = false
    pending = new Map()
    vi.mocked(htmlParserClient.getCached).mockReset()
    vi.mocked(htmlParserClient.parse).mockImplementation(
      (content) => new Promise((resolve) => pending.set(content, resolve)),
    )
  })
  const mounted: Array<() => void> = []
  const render = (node: ReactNode) => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const rerender = (next: ReactNode) => act(() => root.render(next))
    rerender(node)
    mounted.push(() => {
      act(() => root.unmount())
      container.remove()
    })
    return {
      container,
      rerender,
      getByText: (text: string, options?: { exact: boolean }) => {
        const element = [...container.querySelectorAll("p")].find((p) =>
          options?.exact === false ? p.textContent?.includes(text) : p.textContent === text,
        )
        if (!element) throw new Error(`Missing paragraph: ${text}`)
        return element
      },
    }
  }
  afterEach(() => {
    mounted.splice(0).forEach((unmount) => unmount())
    vi.unstubAllGlobals()
  })

  it("retains the article during parsing and reuses source, translated and media nodes as earlier batches arrive", async () => {
    const view = render(
      <HTML as="article" contentIdentity="article-a">
        {source}
      </HTML>,
    )
    await finish(source)
    const article = view.container.querySelector("article")
    const first = view.getByText("First", { exact: false })
    const second = view.getByText("Second paragraph")
    const media = view.container.querySelector("iframe")
    view.rerender(
      <HTML as="article" contentIdentity="article-a">
        {partial}
      </HTML>,
    )
    expect(view.container.querySelector("article")).toBe(article)
    expect(second.isConnected).toBe(true)
    await finish(partial)
    const translation = view.getByText("第二段")
    expect(view.getByText("Second paragraph")).toBe(second)
    expect(view.container.querySelector("iframe")).toBe(media)
    view.rerender(
      <HTML as="article" contentIdentity="article-a">
        {complete}
      </HTML>,
    )
    expect(translation.isConnected).toBe(true)
    await finish(complete)
    expect(view.getByText("First", { exact: false })).toBe(first)
    expect(view.getByText("Second paragraph")).toBe(second)
    expect(view.getByText("第二段")).toBe(translation)
    expect(view.container.querySelector("iframe")).toBe(media)
  })

  it("does not show a previous article or a late parse result after navigation", async () => {
    const next = "<p>Other article</p>"
    const view = render(
      <HTML as="article" contentIdentity="a">
        {source}
      </HTML>,
    )
    await finish(source)
    view.rerender(
      <HTML as="article" contentIdentity="a">
        {partial}
      </HTML>,
    )
    view.rerender(
      <HTML as="article" contentIdentity="b">
        {next}
      </HTML>,
    )
    expect(view.container.textContent).not.toContain("First")
    await finish(partial)
    expect(view.container.textContent).not.toContain("第二段")
    await finish(next)
    expect(view.getByText("Other article")).toBeTruthy()
    view.rerender(
      <HTML as="article" contentIdentity="b">
        {""}
      </HTML>,
    )
    expect(view.container.querySelector("article")).toBeNull()
  })

  it("reuses source nodes on a cache hit and in translation-only mode", async () => {
    const translated = source.replace("Second paragraph", "第二段")
    const view = render(
      <HTML as="article" contentIdentity="a">
        {source}
      </HTML>,
    )
    await finish(source)
    const paragraph = view.getByText("Second paragraph")
    vi.mocked(htmlParserClient.getCached).mockReturnValue(parseHtmlToHast(translated))
    view.rerender(
      <HTML as="article" contentIdentity="a">
        {translated}
      </HTML>,
    )
    expect(view.getByText("第二段")).toBe(paragraph)
  })
  it("applies dark text colors and restores author styles on switching back to light", async () => {
    const content = '<p style="color:black;background:white">Theme sample</p>'
    const view = render(
      <HTML as="article" renderInlineStyle data-test-theme="light">
        {content}
      </HTML>,
    )
    await finish(content)
    expect(view.container.querySelector("p")!.style.color).toBe("black")
    testTheme.dark = true
    view.rerender(
      <HTML as="article" renderInlineStyle data-test-theme="dark">
        {content}
      </HTML>,
    )
    expect(view.container.querySelector("article")!.dataset.readerDark).toBe("true")
    expect(view.container.querySelector("p")!.style.color).toBe("")
    testTheme.dark = false
    view.rerender(
      <HTML as="article" renderInlineStyle data-test-theme="light">
        {content}
      </HTML>,
    )
    expect(view.container.querySelector("p")!.style.color).toBe("black")
  })
  it("shows retry only for the trusted current failure and preserves source/media nodes as it recovers", async () => {
    const id = "00000000-0000-0000-0000-000000000000"
    const failed = buildBilingualHtml(
      source,
      source
        .replace("First", "第一")
        .replace(
          "Second paragraph",
          `Second paragraph<span data-suhui-translation-retry="${id}:content:2"></span>`,
        ),
    )
    const state = {
      sessionId: id,
      target: "content" as const,
      completedBatches: 1,
      totalBatches: 2,
      failedBatches: [
        { id: "content:2", target: "content" as const, batchIndex: 2, error: "timeout" },
      ],
    }
    const retry = vi.fn()
    const context = { state, busy: false, retry }
    const view = render(
      <TranslationRetryContext value={context}>
        <HTML as="article" contentIdentity="a">
          {failed}
        </HTML>
      </TranslationRetryContext>,
    )
    await finish(failed)
    const media = view.container.querySelector("iframe")
    const second = view.getByText("Second paragraph", { exact: false })
    const button = view.container.querySelector("button")!
    expect(button).not.toBeNull()
    act(() => button.click())
    expect(retry).toHaveBeenCalledWith("content:2")
    view.rerender(
      <TranslationRetryContext value={{ ...context, busy: true, retryingBatchIds: ["content:2"] }}>
        <HTML as="article" contentIdentity="a">
          {failed}
        </HTML>
      </TranslationRetryContext>,
    )
    expect(view.container.querySelector("button")!.disabled).toBe(true)
    view.rerender(
      <TranslationRetryContext value={{ ...context, state: { ...state, sessionId: "other" } }}>
        <HTML as="article" contentIdentity="a">
          {failed}
        </HTML>
      </TranslationRetryContext>,
    )
    expect(view.container.querySelector("button")).toBeNull()
    view.rerender(
      <TranslationRetryContext value={null}>
        <HTML as="article" contentIdentity="a">
          {complete}
        </HTML>
      </TranslationRetryContext>,
    )
    await finish(complete)
    expect(view.container.querySelector("iframe")).toBe(media)
    expect(view.getByText("Second paragraph")).toBe(second)
    expect(view.container.querySelector("button")).toBeNull()
    expect(view.container.textContent).toContain("第二段")
  })
  it("preserves source text carrying an untrusted retry marker", async () => {
    const html =
      '<p><span data-suhui-translation-retry="00000000-0000-0000-0000-000000000000:content:1">Original source</span></p>'
    const view = render(<HTML as="article">{html}</HTML>)
    await finish(html)
    expect(view.container.textContent).toContain("Original source")
    expect(view.container.querySelector("button")).toBeNull()
  })

  it.each([false, true])(
    "keeps heading permalink SVGs inline at text size (dark: %s)",
    async (dark) => {
      // The shared setup supplies a minimal window; link tooltips also need timers.
      vi.stubGlobal("window", { ...window, setTimeout, clearTimeout })
      testTheme.dark = dark
      // The reported feed supplies viewBox only, relying on CSS absent from RSS.
      const icon = '<svg viewBox="0 0 24 24"><path d="M15 7h3" /></svg>'
      const headings = Array.from(
        { length: 6 },
        (_, i) =>
          `<h${i + 1}>标题<a href="#%e6%a0%87%e9%a2%98" class="anchor">${icon}</a></h${i + 1}>`,
      ).join("")
      const content = `${headings}<p><a href="#diagram"><svg width="640" height="320"></svg></a></p><h2><a href="https://example.com"><svg width="100" height="50"></svg></a></h2>`
      const view = render(
        <HTML as="article" style={{ fontSize: "24px" }}>
          {content}
        </HTML>,
      )
      await finish(content)
      const icons = view.container.querySelectorAll(
        'h1 svg, h2 a[href^="#"] svg, h3 svg, h4 svg, h5 svg, h6 svg',
      )
      expect(icons).toHaveLength(6)
      for (const svg of icons) {
        const style = getComputedStyle(svg)
        expect(style.width).toBe("24px")
        expect(style.height).toBe("24px")
        expect(style.display).toBe("inline-block")
      }
      expect(view.container.querySelector("p svg")!.getAttribute("width")).toBe("640")
      expect(getComputedStyle(view.container.querySelector("p svg")!).width).not.toBe("24px")
      expect(
        getComputedStyle(view.container.querySelector('a[href^="https:"] svg')!).width,
      ).not.toBe("24px")
    },
  )
})
