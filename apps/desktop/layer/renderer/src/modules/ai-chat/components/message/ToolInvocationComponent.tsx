import type { ToolUIPart } from "ai"
import { getToolName } from "ai"
import * as React from "react"

interface ToolInvocationComponentProps {
  part: ToolUIPart
}

export const ToolInvocationComponent: React.FC<ToolInvocationComponentProps> = React.memo(
  ({ part }) => {
    const toolName = getToolName(part)
    const hasError = "errorText" in part && part.errorText

    return (
      <div
        className={`min-w-0 max-w-prose text-left ${hasError ? "border-red/30" : "border-border"}`}
      >
        <div className="w-[9999px] max-w-[calc(var(--ai-chat-layout-width,65ch)_-120px)]" />
        <div className="flex h-6 min-w-0 flex-1 items-center">
          <div className="flex items-center gap-2 text-xs">
            <i className={hasError ? "i-mgc-close-cute-re text-red" : "i-mingcute-tool-line"} />
            <span className="text-text-secondary">
              {hasError ? "Tool Failed:" : "Tool Calling:"}
            </span>
            <h4 className={`truncate font-medium ${hasError ? "text-red" : "text-text"}`}>
              {toolName}
            </h4>
          </div>
        </div>
      </div>
    )
  },
)
