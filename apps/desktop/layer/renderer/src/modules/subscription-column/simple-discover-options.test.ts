import { describe, expect, it } from 'vitest'

import { getSimpleDiscoverModes, shouldShowDiscoverJumpHint } from './simple-discover-options'

describe('simple discover options', () => {
  it('only keeps rss and rsshub', () => {
    expect(getSimpleDiscoverModes()).toEqual(['rss', 'rsshub'])
  })

  it('does not show discover jump hint in local mode', () => {
    expect(shouldShowDiscoverJumpHint()).toBe(false)
  })
})
