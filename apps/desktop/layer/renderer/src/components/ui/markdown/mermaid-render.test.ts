import { afterEach, describe, expect, it, vi } from "vitest"

import { renderMermaidImage } from "./mermaid-render"

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
  mermaidAPI: {
    getDiagramFromText: vi.fn(async () => ({ db: {} })),
    defaultConfig: {
      securityLevel: "strict",
      themeCSS: "",
      themeVariables: {},
      flowchart: {},
      fontFamily: "sans-serif",
    },
  },
}))
vi.mock("mermaid", () => ({ default: mermaid }))

describe("local Mermaid rendering", () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ""
  })
  it("serializes configuration/render across themes and uses inert image output", async () => {
    let finish!: (value: { svg: string; bindFunctions: () => void }) => void
    const bind = vi.fn()
    mermaid.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    mermaid.render.mockResolvedValueOnce({ svg: "<svg>dark</svg>", bindFunctions: bind })
    const first = renderMermaidImage("graph TD; A-->B", false)
    const second = renderMermaidImage("graph TD; B-->C", true)
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalledOnce())
    expect(mermaid.initialize).toHaveBeenCalledOnce()
    expect(mermaid.initialize.mock.calls[0]![0]).toMatchObject({
      securityLevel: "strict",
      startOnLoad: false,
      htmlLabels: false,
      theme: "default",
      maxEdges: 500,
      secure: expect.arrayContaining([
        "secure",
        "securityLevel",
        "themeCSS",
        "themeVariables",
        "flowchart",
        "fontFamily",
      ]),
    })
    finish({ svg: "<svg>light</svg>", bindFunctions: bind })
    expect(decodeURIComponent(await first)).toContain(
      "data:image/svg+xml;charset=utf-8,<svg>light</svg>",
    )
    expect(decodeURIComponent(await second)).toContain("<svg>dark</svg>")
    expect(mermaid.initialize.mock.calls[1]![0].theme).toBe("dark")
    expect(bind).not.toHaveBeenCalled()
    expect(document.body.children).toHaveLength(0)
  })

  it("cleans failed layout nodes and allows the following diagram to render", async () => {
    mermaid.render.mockRejectedValueOnce(new Error("parse error"))
    await expect(renderMermaidImage("invalid", false)).rejects.toThrow("parse error")
    expect(document.body.children).toHaveLength(0)
    mermaid.render.mockResolvedValueOnce({ svg: "<svg/>" })
    await expect(renderMermaidImage("graph TD; A-->B", false)).resolves.toContain(
      "data:image/svg+xml",
    )
  })

  it("rejects parsed image metadata before layout and keeps the queue usable", async () => {
    mermaid.mermaidAPI.getDiagramFromText.mockResolvedValueOnce({
      db: { getData: () => ({ nodes: [{ img: "https://example.com/never-responds" }] }) },
    } as any)
    await expect(
      renderMermaidImage("flowchart TD; A@{img: 'https://example.com/never-responds'}", false),
    ).rejects.toThrow("图片节点")
    expect(mermaid.render).not.toHaveBeenCalled()
    mermaid.render.mockResolvedValueOnce({ svg: '<svg viewBox="0 0 640 320"/>' })
    const result = decodeURIComponent(await renderMermaidImage("graph TD; A-->B", false))
    expect(result).toContain('width="640"')
    expect(result).toContain('height="320"')
  })

  it.each(["", " ", "a".repeat(50_001)])(
    "rejects empty or oversized diagrams before rendering",
    async (source) => {
      await expect(renderMermaidImage(source, false)).rejects.toThrow()
      expect(mermaid.render).not.toHaveBeenCalled()
    },
  )
})
