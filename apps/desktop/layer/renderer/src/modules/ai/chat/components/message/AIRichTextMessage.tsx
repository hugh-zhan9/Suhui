import { defaultLexicalTheme } from "@follow/components/ui/lexical-rich-editor/index.js"
import { cn } from "@follow/utils"
import { CodeHighlightNode, CodeNode } from "@lexical/code"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { MarkNode } from "@lexical/mark"
import type { InitialConfigType } from "@lexical/react/LexicalComposer"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import type { SerializedEditorState } from "lexical"
import { ParagraphNode, TextNode } from "lexical"
import * as React from "react"

function onError(error: Error) {
  console.error("Lexical Read-Only Editor Error:", error)
}

interface AIRichTextMessageProps {
  data: {
    state: SerializedEditorState
    text: string
  }
  className?: string
}

export const AIRichTextMessage: React.FC<AIRichTextMessageProps> = ({ data, className }) => {
  const initialConfig: InitialConfigType = {
    namespace: "AIRichTextDisplay",
    theme: defaultLexicalTheme,
    onError,
    editable: false, // Read-only mode
    editorState: JSON.stringify(data.state),
    nodes: [
      // Core nodes
      ParagraphNode,
      TextNode,

      // Rich text nodes
      HeadingNode,
      QuoteNode,

      // List nodes
      ListNode,
      ListItemNode,

      // Code nodes
      CodeNode,
      CodeHighlightNode,

      // Link nodes
      LinkNode,

      // Text format nodes
      MarkNode,
    ],
  }

  return (
    <div className={cn("text-text relative text-sm", className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="focus:outline-none" style={{ outline: "none" }} />
          }
          ErrorBoundary={LexicalErrorBoundary}
          placeholder={null}
        />
      </LexicalComposer>
    </div>
  )
}
