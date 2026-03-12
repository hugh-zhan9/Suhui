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
export function snapshotBrowserWindow(window: {
  getBounds: () => Bounds
  isDestroyed: () => boolean
  isFocused: () => boolean
  isMinimized: () => boolean
  isVisible: () => boolean
}) {
  if (window.isDestroyed()) {
    return describeWindowState({
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      destroyed: true,
      focused: false,
      minimized: false,
      visible: false,
    })
  }
  return describeWindowState({
    bounds: window.getBounds(),
    destroyed: window.isDestroyed(),
    focused: window.isFocused(),
    minimized: window.isMinimized(),
    visible: window.isVisible(),
  })
}
