import type { IpcRenderer } from "electron"
import { createIpcProxy } from "electron-ipc-decorator/client"

import type { IpcServices } from "../../../main/src/ipc"

export const ipcServices = createIpcProxy<IpcServices>(
  window.electron?.ipcRenderer as unknown as IpcRenderer,
)
