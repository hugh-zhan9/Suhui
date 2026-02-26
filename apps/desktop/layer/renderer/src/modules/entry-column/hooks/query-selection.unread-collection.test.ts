import { describe, expect, it } from 'vitest'

import { shouldFilterUnreadEntries } from './query-selection'

describe('query selection unread filter', () => {
  it('收藏页应忽略 unreadOnly 过滤，始终展示全部收藏', () => {
    expect(shouldFilterUnreadEntries({ isCollection: true, unreadOnly: true })).toBe(false)
  })

  it('非收藏页在 unreadOnly=true 时应启用未读过滤', () => {
    expect(shouldFilterUnreadEntries({ isCollection: false, unreadOnly: true })).toBe(true)
  })
})
