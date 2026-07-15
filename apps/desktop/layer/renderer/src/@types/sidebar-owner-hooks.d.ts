declare module "virtual:sidebar-owner-hooks" {
  import type { SidebarDerivedCategory } from "../modules/subscription-column/sidebar-derived-model"

  export type OwnerRenderKind = "category" | "row"
  export type OwnerProjectionMode = "production" | "rebuild-all"

  export const OWNER_HOOKS_TEST_SENTINEL: "suhui-sidebar-owner-profile-test-only"
  export function observeOwnerRenders(
    observer?: (kind: OwnerRenderKind, sentinel: typeof OWNER_HOOKS_TEST_SENTINEL) => void,
  ): () => void
  export function setOwnerProjectionMode(mode: OwnerProjectionMode): () => void
  export function recordOwnerRender(kind: OwnerRenderKind): void
  export function projectOwnerModel(
    model: readonly SidebarDerivedCategory[],
  ): readonly SidebarDerivedCategory[]
}
