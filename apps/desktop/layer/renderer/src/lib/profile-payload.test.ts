import { describe, expect, it } from 'vitest'

import { toLocalProfileUpdatePayload } from './profile-payload'

describe('toLocalProfileUpdatePayload', () => {
  it('应仅输出本地资料字段，不包含 handle', () => {
    const payload = toLocalProfileUpdatePayload({
      handle: 'legacy_handle',
      name: 'FreeFolo User',
      image: 'https://img.example/avatar.png',
      bio: 'bio',
      website: 'https://freefolo.app',
      socialLinks: {
        github: 'freefolo',
      },
    })

    expect(payload).toEqual({
      name: 'FreeFolo User',
      image: 'https://img.example/avatar.png',
      bio: 'bio',
      website: 'https://freefolo.app',
      socialLinks: {
        github: 'freefolo',
      },
    })
    expect('handle' in payload).toBe(false)
  })
})
