import type { ReactNode } from "react"
import { cloneElement, isValidElement } from "react"

// Translated siblings are inserted progressively. Count source and translation
// slots separately so inserting a translation cannot change later source keys.
export function keyTranslationChildren(children: ReactNode): ReactNode {
  let sourceIndex = 0
  let translationIndex = 0
  const keyed = (child: ReactNode): ReactNode => {
    if (!isValidElement<{ children?: ReactNode; "data-suhui-translation"?: string }>(child)) {
      return child
    }
    const translation = child.props["data-suhui-translation"] === "true"
    const key = translation
      ? `translation-${sourceIndex}-${translationIndex++}`
      : `source-${sourceIndex++}`
    if (!translation) translationIndex = 0
    return cloneElement(child, {
      key,
      ...(child.props.children !== undefined
        ? { children: keyTranslationChildren(child.props.children) }
        : {}),
    })
  }
  return Array.isArray(children) ? children.map(keyed) : keyed(children)
}
