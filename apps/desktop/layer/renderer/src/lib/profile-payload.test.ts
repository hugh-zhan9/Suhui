import { describe, expect, it } from 'vitest'

import { toLocalProfileUpdatePayload } from './profile-payload'

describe('toLocalProfileUpdatePayload', () => {
  it('应仅输出本地资料字段，不包含 handle', () => {
    const payload = toLocalProfileUpdatePayload({
      handle: 'legacy_handle',
      name: '溯洄 User',
      image: 'https://img.example/avatar.png',
      bio: 'bio',
      website: 'https://suhui.app',
      socialLinks: {
        github: 'suhui',
      },
    })

    expect(payload).toEqual({
      name: '溯洄 User',
      image: 'https://img.example/avatar.png',
      bio: 'bio',
      website: 'https://suhui.app',
      socialLinks: {
        github: 'suhui',
      },
    })
    expect('handle' in payload).toBe(false)
  })
})
