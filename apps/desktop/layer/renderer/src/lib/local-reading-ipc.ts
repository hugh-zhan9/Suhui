import { ipcServices } from "~/lib/client"
import type { ParsedOpmlItem } from "~/modules/discover/types"

/**
 * `localReading` 分组的类型入口。
 *
 * electron-ipc-decorator 的 `MergeIpcService` 用 `groupName` 做键，而
 * `LocalReadingService.groupName` 是 override 的静态成员，类型被基类拓宽成 `string`，
 * 于是这一整组在 `IpcServices` 里拿不到。各调用点原来各自 cast 一份，这里收拢成一处。
 */
export type LocalReadingIpc = {
  exportBackup: (path: string, rendererSettings?: Record<string, string>) => Promise<unknown>
  prepareReplaceBackup: (path: string) => Promise<{ token: string }>
  restoreBackup: (input: {
    path: string
    mode: "merge" | "replace"
    confirmationToken?: string
    rendererSettings?: Record<string, string>
  }) => Promise<{ rendererSettings?: Record<string, string> }>
  acknowledgeRendererSettings: () => Promise<void>
  exportOpmlFile: (path: string) => Promise<unknown>
  previewOpmlFile: (path: string) => Promise<ParsedOpmlItem[]>
  importOpmlFile: (input: {
    path: string
    selectedIndexes?: number[]
  }) => Promise<{ imported: number; skipped: number; total: number }>
  previewOpml: (xml: string) => Promise<ParsedOpmlItem[]>
  importOpml: (input: {
    xml: string
    selectedIndexes?: number[]
  }) => Promise<{ imported: number; skipped: number; total: number }>
  convertDatabase: (input: {
    to: "postgres" | "sqlite"
    targetDbConn?: string
    targetDbUser?: string
    targetDbPassword?: string
  }) => Promise<{ from: string; to: string; sourceDbConn: string; recordCount: number }>
}

export const localReadingIpc = () =>
  (ipcServices as unknown as { localReading?: LocalReadingIpc })?.localReading
