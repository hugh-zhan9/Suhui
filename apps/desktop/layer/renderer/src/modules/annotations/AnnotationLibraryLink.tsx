import { IN_ELECTRON } from "@suhui/shared/constants"
import { NavLink } from "react-router"

export function AnnotationLibraryLink() {
  if (!IN_ELECTRON) return null

  return (
    <NavLink
      to="/annotations"
      onClick={(event) => event.stopPropagation()}
      className={({ isActive }) =>
        `no-drag-region mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-fill text-text" : "text-text-secondary hover:bg-fill-quaternary hover:text-text"}`
      }
    >
      <i className="i-mgc-edit-cute-re size-4" aria-hidden />
      笔记与高亮
    </NavLink>
  )
}
