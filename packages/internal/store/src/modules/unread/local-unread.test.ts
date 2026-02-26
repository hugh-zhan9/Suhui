import { describe, expect, it } from 'vitest'

import { applyUnreadCountForAffectedEntries, applyUnreadDeltaForAffectedEntries } from './local-unread'

describe('applyUnreadDeltaForAffectedEntries', () => {
  it('按受影响条目数扣减对应 feed/inbox 的未读数', () => {
    const next = applyUnreadDeltaForAffectedEntries({
      currentCounts: {
        f1: 5,
        f2: 2,
      },
      affectedEntries: [
        { feedId: 'f1' },
        { feedId: 'f1' },
        { feedId: 'f2' },
      ],
    })

    expect(next).toEqual([
      { id: 'f1', count: 3 },
      { id: 'f2', count: 1 },
    ])
  })

  it('不会扣减到负数，且优先使用 inboxHandle 作为计数键', () => {
    const next = applyUnreadDeltaForAffectedEntries({
      currentCounts: {
        inbox_1: 1,
      },
      affectedEntries: [
        { inboxHandle: 'inbox_1', feedId: 'f1' },
        { inboxHandle: 'inbox_1', feedId: 'f1' },
      ],
    })

    expect(next).toEqual([{ id: 'inbox_1', count: 0 }])
  })

  it('在标记为未读时应按受影响条目数增加未读数', () => {
    const next = applyUnreadCountForAffectedEntries({
      currentCounts: {
        f1: 1,
        f2: 0,
      },
      affectedEntries: [
        { feedId: 'f1' },
        { feedId: 'f1' },
        { feedId: 'f2' },
      ],
      operation: 'increment',
    })

    expect(next).toEqual([
      { id: 'f1', count: 3 },
      { id: 'f2', count: 1 },
    ])
  })
})
