import { describe, expect, it } from 'vitest'

import { buildLocalWhoamiUser } from '@follow/store/user/store'

describe('local whoami user', () => {
  it('应优先使用已持久化的本地显示名称与头像', () => {
    const user = buildLocalWhoamiUser({
      name: 'Alice Local',
      image: 'https://img.example/avatar.png',
    } as any)

    expect(user.name).toBe('Alice Local')
    expect(user.image).toBe('https://img.example/avatar.png')
  })
})
