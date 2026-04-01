/**
 * 运行时环境检测
 * 用于区分桌面端和远程浏览器端
 */

declare global {
  interface Window {
    __REMOTE_RUNTIME__?: boolean
  }
}

export const getRuntimeEnv = () => {
  const hasElectron = typeof window !== "undefined" && !!(window as any).electron?.ipcRenderer
  const isRemote = typeof window !== "undefined" && window.__REMOTE_RUNTIME__ === true

  return {
    /** 桌面端 Electron 环境 */
    isDesktop: hasElectron && !isRemote,
    /** 远程浏览器端环境 */
    isRemote: isRemote,
    /** Web 环境（非 Electron、非远程） */
    isWeb: !hasElectron && !isRemote,
  }
}

/** 标记当前为远程运行时 */
export const markRemoteRuntime = () => {
  if (typeof window !== "undefined") {
    window.__REMOTE_RUNTIME__ = true
  }
}
