import { IN_ELECTRON } from "@suhui/shared/constants"

import { setAppSearchOpen } from "~/atoms/app"
import { searchActions } from "~/store/search"
import { SearchType } from "~/store/search/constants"

export function ArticleSearchButton() {
  if (!IN_ELECTRON) return null

  return (
    <button
      type="button"
      className="no-drag-region mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-fill-quaternary hover:text-text"
      onClick={(event) => {
        event.stopPropagation()
        searchActions.setSearchType(SearchType.Entry)
        setAppSearchOpen(true)
      }}
    >
      <i className="i-mgc-search-cute-re size-4" aria-hidden />
      搜索文章
    </button>
  )
}
