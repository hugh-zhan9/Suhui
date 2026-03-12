type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

type WindowSnapshot = {
  bounds: Bounds
  destroyed: boolean
  focused: boolean
  minimized: boolean
  visible: boolean
}

export function describeWindowState(snapshot: WindowSnapshot) {
  return snapshot
}
export function snapshotBrowserWindow(
  window: {
    getBounds: () => Bounds
    isDestroyed: () => boolean
    isFocused: () => boolean
    isMinimized: () => boolean
    isVisible: () => boolean
  } | null,
) {
  if (!window || typeof window.isDestroyed !== "function" || window.isDestroyed()) {
    return describeWindowState({
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      destroyed: true,
      focused: false,
      minimized: false,
      visible: false,
    })
  }

  try {
    return describeWindowState({
      bounds: window.getBounds(),
      destroyed: false,
      focused: window.isFocused(),
      minimized: window.isMinimized(),
      visible: window.isVisible(),
    })
  } catch (err) {
    // 如果在获取过程中对象被销毁，返回默认状态
    return describeWindowState({
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      destroyed: true,
      focused: false,
      minimized: false,
      visible: false,
    })
  }
}
