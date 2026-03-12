import type { FeedViewType } from "@suhui/constants"

import { countUnreadByView } from "../../../lib/unread-by-view"

export const selectTimelineUnreadByView = (state: any, view: FeedViewType) =>
  countUnreadByView(state, view)
