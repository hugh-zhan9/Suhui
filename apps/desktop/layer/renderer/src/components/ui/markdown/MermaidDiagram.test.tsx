import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderMermaidImage } from "./mermaid-render"
import { MermaidDiagram } from "./MermaidDiagram"

const theme = vi.hoisted(() => ({ dark: false }))
vi.mock("@suhui/hooks", () => ({ useIsDark: () => theme.dark }))
vi.mock("./mermaid-render", () => ({
  MermaidInputError: class extends Error {},
  renderMermaidImage: vi.fn(),
}))

describe("Mermaid article block lifecycle", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    theme.dark = false
    vi.clearAllMocks()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const render = async (source: string) => {
    await act(async () => root.render(<MermaidDiagram source={source} />))
  }

  it("shows the diagram, refreshes its theme and preserves inspectable source", async () => {
    vi.mocked(renderMermaidImage).mockResolvedValue("data:image/svg+xml,light")
    await render("graph TD; A-->B")
    expect(container.querySelector("img")?.src).toBe("data:image/svg+xml,light")
    expect(container.querySelector("code")?.textContent).toBe("graph TD; A-->B")
    theme.dark = true
    vi.mocked(renderMermaidImage).mockResolvedValue("data:image/svg+xml,dark")
    await render("graph TD; A-->B")
    expect(renderMermaidImage).toHaveBeenLastCalledWith("graph TD; A-->B", true)
    expect(container.querySelector("img")?.src).toBe("data:image/svg+xml,dark")
  })

  it("ignores old results after source changes and unmount", async () => {
    let finish!: (value: string) => void
    vi.mocked(renderMermaidImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await render("old")
    vi.mocked(renderMermaidImage).mockResolvedValueOnce("data:image/svg+xml,new")
    await render("new")
    await act(async () => finish("data:image/svg+xml,old"))
    expect(container.querySelector("img")?.src).toBe("data:image/svg+xml,new")
    vi.mocked(renderMermaidImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await render("pending")
    await act(async () => root.render(null))
    await act(async () => finish("data:image/svg+xml,pending"))
    expect(container.children).toHaveLength(0)
  })

  it("shows a local failure with source instead of throwing through the article", async () => {
    vi.mocked(renderMermaidImage).mockRejectedValue(new Error("bad diagram"))
    await render("invalid diagram")
    expect(container.querySelector('[role="status"]')?.textContent).toContain("图表无法渲染")
    expect(container.querySelector("code")?.textContent).toBe("invalid diagram")
    expect(container.querySelector("img")).toBeNull()
  })
})
