export const shouldAutoReloadDynamicImportError = ({
  message,
  hasReloadedInSession,
  inElectron,
}: {
  message: string
  hasReloadedInSession: boolean
  inElectron: boolean
}) => {
  if (!message.startsWith('Failed to fetch dynamically imported module')) {
    return false
  }

  if (hasReloadedInSession) {
    return false
  }

  // Electron 本地模式下禁止自动整窗 reload，避免白屏闪烁影响使用。
  if (inElectron) {
    return false
  }

  return true
}
