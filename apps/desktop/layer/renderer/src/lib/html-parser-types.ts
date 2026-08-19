import type { Root } from "hast"

export type HtmlParserOptions = {
  renderInlineStyle?: boolean
  noMedia?: boolean
}

export type HtmlParserWorkerRequest = {
  id: number
  content: string
  options: HtmlParserOptions
}

export type HtmlParserWorkerResponse =
  | { id: number; hastTree: Root }
  | { id: number; error: string }
