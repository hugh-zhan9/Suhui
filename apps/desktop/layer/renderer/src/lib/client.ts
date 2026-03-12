import type { IpcRenderer } from "electron"
import { createIpcProxy } from "electron-ipc-decorator/client"

import type { IpcServices } from "../../../main/src/ipc"

type DiscoverIpc = {
  getTrendingFeeds: (input: { language?: string; view?: number; limit?: number }) => Promise<any>
  rsshub: (input: {
    category?: string
    categories?: string
    lang?: string
    namespace?: string
  }) => Promise<any>
  rsshubAnalytics: (input: { lang?: string }) => Promise<any>
  rsshubRoute: (input: { route: string }) => Promise<any>
}

export const ipcServices = createIpcProxy<IpcServices & { discover: DiscoverIpc }>(
  window.electron?.ipcRenderer as unknown as IpcRenderer,
)
