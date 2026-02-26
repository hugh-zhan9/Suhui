export const shouldShowMainWindowOnReady = ({
  wasOpenedAsHidden,
  startInTray,
  handledOnce,
}: {
  wasOpenedAsHidden: boolean
  startInTray: boolean
  handledOnce: boolean
}) => {
  if (wasOpenedAsHidden) return false
  if (startInTray) return false
  if (handledOnce) return false
  return true
}
