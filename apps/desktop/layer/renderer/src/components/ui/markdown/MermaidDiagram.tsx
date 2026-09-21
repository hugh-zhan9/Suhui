import { useIsDark } from "@suhui/hooks"
import { useEffect, useState } from "react"

import { MermaidInputError, renderMermaidImage } from "./mermaid-render"

export function MermaidDiagram({ source }: { source: string }) {
  const dark = useIsDark()
  const [result, setResult] = useState<{
    source: string
    dark: boolean
    image?: string
    error?: string
  } | null>(null)
  const current = result?.source === source && result.dark === dark ? result : null

  useEffect(() => {
    let cancelled = false
    void renderMermaidImage(source, dark).then(
      (image) => {
        if (!cancelled) setResult({ source, dark, image })
      },
      (error) => {
        if (!cancelled)
          setResult({
            source,
            dark,
            error:
              error instanceof MermaidInputError
                ? error.message
                : "图表无法渲染，请检查源码语法及大小（最多 50,000 字符、500 条边）。",
          })
      },
    )
    return () => {
      cancelled = true
    }
  }, [source, dark])

  return (
    <div className="not-prose my-4" data-mermaid-diagram>
      {current?.image ? (
        <img
          className="h-auto max-w-full"
          src={current.image}
          alt="Mermaid 图表"
          onError={() => setResult({ source, dark, error: "图表图片加载失败。" })}
        />
      ) : (
        <p role="status" className="select-text text-sm text-text-secondary">
          {current?.error ?? "正在绘制图表…"}
        </p>
      )}
      <details className="mt-2 text-sm text-text-secondary">
        <summary className="cursor-pointer">查看图表源码</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre p-3">
          <code>{source}</code>
        </pre>
      </details>
    </div>
  )
}
