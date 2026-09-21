import type { MermaidConfig } from "mermaid"

// Mermaid has process-wide configuration. Serialize initialize + render together,
// otherwise concurrent diagrams or a theme change can use another job's settings.
let pending: Promise<unknown> = Promise.resolve()
let nextId = 0

export class MermaidInputError extends Error {}

function containsImageNode(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return false
  seen.add(value)
  if ("img" in value && value.img) return true
  const children = value instanceof Map ? [...value.values()] : Object.values(value)
  return children.some((child) => containsImageNode(child, seen))
}

export function renderMermaidImage(source: string, dark: boolean): Promise<string> {
  const render = async () => {
    if (!source.trim()) throw new MermaidInputError("图表内容为空。")
    if (source.length > 50_000) throw new MermaidInputError("图表内容超过 50,000 字符限制。")
    const { default: mermaid } = await import("mermaid")
    const config: MermaidConfig = {
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      maxEdges: 500,
      theme: dark ? "dark" : "default",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    }
    // Feed frontmatter/directives must not override application configuration,
    // including nested diagram options and theme CSS.
    mermaid.initialize({
      ...config,
      secure: [
        ...new Set([
          "secure",
          ...Object.keys(mermaid.mermaidAPI.defaultConfig),
          ...Object.keys(config),
        ]),
      ],
    })
    // strict disables callbacks, but image nodes still call Image.decode() during
    // layout. Reject their parsed metadata (including quoted YAML keys) before
    // rendering, so a stalled external image cannot block every queued diagram.
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source)
    const db = diagram.db as { getData?: () => unknown }
    if (containsImageNode(db.getData?.())) {
      throw new MermaidInputError("阅读模式不支持图表中的图片节点。")
    }
    const host = document.createElement("div")
    host.setAttribute("aria-hidden", "true")
    host.style.cssText =
      "position:fixed;left:-100000px;top:0;width:1200px;visibility:hidden;pointer-events:none"
    document.body.append(host)
    try {
      const { svg } = await mermaid.render(`suhui-mermaid-${++nextId}`, source, host)
      // Mermaid's percentage width is for inline SVG. An <img> otherwise gets
      // the browser's 300×150 default, losing the diagram's intrinsic dimensions.
      const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
      const box = root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number)
      let imageSvg = svg
      if (box?.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) {
        root.setAttribute("width", String(box[2]))
        root.setAttribute("height", String(box[3]))
        imageSvg = new XMLSerializer().serializeToString(root)
      }
      // SVG is loaded in an image context, not inserted into privileged article DOM.
      // No bindFunctions: diagram links and callbacks cannot act on the reader.
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(imageSvg)}`
    } finally {
      host.remove()
    }
  }
  const result = pending.then(render)
  pending = result.catch(() => {})
  return result
}
