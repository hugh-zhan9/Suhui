import { describe, expect, it } from 'vitest'

import { shouldShowInlineStarInEntryListHeader } from './entry-list-header-actions'

describe('entry list header actions', () => {
  it('列表栏位不应显示收藏快捷按钮（仅详情右上角保留）', () => {
    expect(shouldShowInlineStarInEntryListHeader({ isWideMode: false, hasEntry: true })).toBe(false)
    expect(shouldShowInlineStarInEntryListHeader({ isWideMode: true, hasEntry: true })).toBe(false)
  })
})
