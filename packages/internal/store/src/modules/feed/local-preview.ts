export const shouldUseElectronLocalPreview = (win: unknown, feedUrl: string) => {
  if (!feedUrl) return false
  const electron = (win as { electron?: { ipcRenderer?: unknown } } | undefined)?.electron
  return !!electron?.ipcRenderer
}
