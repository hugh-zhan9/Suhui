import { describe, expect, it } from 'vitest'

import { isHiddenLocalSettingPath } from './local-hidden-settings'

describe('local hidden settings', () => {
  it('hides feeds/list/notifications', () => {
    expect(isHiddenLocalSettingPath('feeds')).toBe(true)
    expect(isHiddenLocalSettingPath('list')).toBe(true)
    expect(isHiddenLocalSettingPath('notifications')).toBe(true)
  })

  it('keeps other settings visible', () => {
    expect(isHiddenLocalSettingPath('general')).toBe(false)
    expect(isHiddenLocalSettingPath('appearance')).toBe(false)
  })
})
