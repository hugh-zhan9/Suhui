import type { SidebarDerivedCategory } from "./sidebar-derived-model"

export type OwnerRenderKind = "category" | "row"
export type OwnerProjectionMode = "production" | "rebuild-all"

export const OWNER_HOOKS_TEST_SENTINEL = "suhui-sidebar-owner-profile-test-only"
const ownerHooksTestMarker = Symbol(OWNER_HOOKS_TEST_SENTINEL)

let ownerRenderObserver:
  | ((kind: OwnerRenderKind, sentinel: typeof OWNER_HOOKS_TEST_SENTINEL) => void)
  | undefined
let projectionMode: OwnerProjectionMode = "production"

export const observeOwnerRenders = (
  observer?: (kind: OwnerRenderKind, sentinel: typeof OWNER_HOOKS_TEST_SENTINEL) => void,
) => {
  ownerRenderObserver = observer
  return () => {
    if (ownerRenderObserver === observer) ownerRenderObserver = undefined
  }
}

export const recordOwnerRender = (kind: OwnerRenderKind) => {
  ownerRenderObserver?.(kind, OWNER_HOOKS_TEST_SENTINEL)
}

export const setOwnerProjectionMode = (mode: OwnerProjectionMode) => {
  projectionMode = mode
  return () => {
    projectionMode = "production"
  }
}

export const projectOwnerModel = (
  model: readonly SidebarDerivedCategory[],
): readonly SidebarDerivedCategory[] => {
  if (projectionMode === "production") return model
  return model.map((category) => ({
    ...category,
    subscriptionIds: category.subscriptionIds.concat(),
    [ownerHooksTestMarker]: OWNER_HOOKS_TEST_SENTINEL,
  }))
}
