/// <reference lib="webworker" />
import { EntrySearchIndex } from "./entry-index"
import type { SearchWorkerRequest, SearchWorkerResponse } from "./entry-index"

const scope = self as unknown as DedicatedWorkerGlobalScope
const index = new EntrySearchIndex()
scope.onmessage = ({ data }: MessageEvent<SearchWorkerRequest>) => {
  const response: SearchWorkerResponse = { id: data.id }
  try {
    if (data.type === "add") index.add(data.documents)
    else response.items = index.search(data.keyword, data.scope, data.activeFeedIds)
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error)
  }
  scope.postMessage(response)
}
