import { FeedViewType } from "@follow/constants"
import { createZustandStore } from "../../lib/helper"
import type { EntryModel } from "./types"

type EntryId = string
type FeedId = string
type InboxId = string
type Category = string
type ListId = string

export interface EntryState {
  data: Record<EntryId, EntryModel>
  entryIdByView: Record<FeedViewType, Set<EntryId>>
  entryIdByCategory: Record<Category, Set<EntryId>>
  entryIdByFeed: Record<FeedId, Set<EntryId>>
  entryIdByInbox: Record<InboxId, Set<EntryId>>
  entryIdByList: Record<ListId, Set<EntryId>>
  entryIdSet: Set<EntryId>
}

export const defaultState: EntryState = {
  data: {},
  entryIdByView: {
    [FeedViewType.All]: new Set(),
    [FeedViewType.Articles]: new Set(),
    [FeedViewType.Audios]: new Set(),
    [FeedViewType.Notifications]: new Set(),
    [FeedViewType.Pictures]: new Set(),
    [FeedViewType.SocialMedia]: new Set(),
    [FeedViewType.Videos]: new Set(),
  },
  entryIdByCategory: {},
  entryIdByFeed: {},
  entryIdByInbox: {},
  entryIdByList: {},
  entryIdSet: new Set(),
}

export const useEntryStore = createZustandStore<EntryState>("entry")(() => defaultState)
