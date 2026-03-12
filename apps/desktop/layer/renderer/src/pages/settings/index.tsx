import { nextFrame } from "@suhui/utils/dom"
import { useLayoutEffect } from "react"

export const Component = () => {
  useLayoutEffect(() => {
    nextFrame(() => window.router.navigate("/settings/general"))
  }, [])
  return null
}
