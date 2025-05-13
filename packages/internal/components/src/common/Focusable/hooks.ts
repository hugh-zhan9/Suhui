import { use } from "react"

import { FocusableContext, FocusActionsContext, FocusTargetRefContext } from "./context"

export const useFocusable = () => {
  return use(FocusableContext)
}

export const useFocusTargetRef = () => {
  return use(FocusTargetRefContext)
}

export const useFocusActions = () => {
  return use(FocusActionsContext)
}
