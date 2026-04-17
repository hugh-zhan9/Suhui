import { scheduleSkipNextIndexedDbMigration } from "@suhui/database/db.desktop"
import type { IpcRenderer } from "electron"
import { createIpcProxy } from "electron-ipc-decorator/client"

import { clearDbScopedPersistedRendererState } from "~/store/utils/clear"

import { clearRendererQueryCache } from "./query-client"
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

export type RendererDbConfigView = {
  dbType: "postgres"
  dbConn: string
  dbUser: string
  dbPasswordMasked: string
  effectiveSource: "env" | "store-override"
  overrideActive: boolean
  envSource?: string
  envCandidates: string[]
}

export type RendererDbSwitchInput = {
  dbConn: string
  dbUser: string
  dbPassword?: string
}

type AppDbConfigIpc = {
  getDbConfig?: () => Promise<RendererDbConfigView> | RendererDbConfigView
  resetDbConfigOverride?: () => Promise<unknown> | unknown
  setDbConfig?: (input: RendererDbSwitchInput) => Promise<unknown> | unknown
  updateDbConfig?: (input: RendererDbSwitchInput) => Promise<unknown> | unknown
  switchDbConfig?: (input: RendererDbSwitchInput) => Promise<unknown> | unknown
}

export const ipcServices = createIpcProxy<IpcServices & { discover: DiscoverIpc }>(
  window.electron?.ipcRenderer as unknown as IpcRenderer,
)

const getDbConfigIpc = () => (ipcServices?.app ?? undefined) as AppDbConfigIpc | undefined

const resolveDbSwitchMethod = () => {
  const appIpc = getDbConfigIpc()
  return appIpc?.switchDbConfig ?? appIpc?.updateDbConfig ?? appIpc?.setDbConfig
}

export const canSwitchRendererDbConfig = () => Boolean(resolveDbSwitchMethod())

export const getRendererDbConfig = async (): Promise<RendererDbConfigView | null> => {
  const config = await getDbConfigIpc()?.getDbConfig?.()
  return (config ?? null) as RendererDbConfigView | null
}

export const switchRendererDbConfig = async (input: RendererDbSwitchInput) => {
  const switchMethod = resolveDbSwitchMethod()
  if (!switchMethod) {
    throw new Error("Current build does not support runtime database switching yet.")
  }
  return await switchMethod(input)
}

export const resetRendererDbConfigOverride = async () => {
  const resetMethod = getDbConfigIpc()?.resetDbConfigOverride
  if (!resetMethod) {
    throw new Error("Current build does not support resetting the runtime database override yet.")
  }
  return await resetMethod()
}

export const resetRendererAfterDatabaseSwitch = async () => {
  await clearRendererQueryCache()
  clearDbScopedPersistedRendererState()
  scheduleSkipNextIndexedDbMigration()
  window.location.reload()
}
