import { describe, expect, it } from 'vitest'

import { dedupeEntryIdsPreserveOrder } from './entry-id-utils'

describe('dedupeEntryIdsPreserveOrder', () => {
  it('removes duplicates and keeps first occurrence order', () => {
    expect(dedupeEntryIdsPreserveOrder(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })

  it('keeps original array when no duplicates', () => {
    expect(dedupeEntryIdsPreserveOrder(['x', 'y'])).toEqual(['x', 'y'])
  })
})
