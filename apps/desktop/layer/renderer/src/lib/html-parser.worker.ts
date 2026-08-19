/// <reference lib="webworker" />

import { parseHtmlToHast } from "@suhui/utils/html"

import type { HtmlParserWorkerRequest, HtmlParserWorkerResponse } from "./html-parser-types"

const workerScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<HtmlParserWorkerRequest>) => {
  const { id, content, options } = event.data
  try {
    const response: HtmlParserWorkerResponse = {
      id,
      hastTree: parseHtmlToHast(content, options),
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: HtmlParserWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    }
    workerScope.postMessage(response)
  }
}
