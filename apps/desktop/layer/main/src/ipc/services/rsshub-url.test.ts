import { describe, expect, it } from 'vitest'

import { resolveRsshubUrl } from './rsshub-url'

describe('resolveRsshubUrl', () => {
  it('非 RSSHub URL 应原样返回', () => {
    const result = resolveRsshubUrl({
      url: 'https://example.com/feed.xml',
      state: { status: 'running', port: 12000, token: 't1' },
      customHosts: [],
    })

    expect(result).toEqual({ resolvedUrl: 'https://example.com/feed.xml', token: null })
  })

  it('rsshub.app URL 应改写到本地端口并保留参数', () => {
    const result = resolveRsshubUrl({
      url: 'https://rsshub.app/github/trending?since=daily#top',
      state: { status: 'running', port: 12001, token: 't2' },
      customHosts: [],
    })

    expect(result).toEqual({
      resolvedUrl: 'http://127.0.0.1:12001/github/trending?since=daily#top',
      token: 't2',
    })
  })

  it('rsshub:// 协议应正确改写为路径', () => {
    const result = resolveRsshubUrl({
      url: 'rsshub://github/trending?language=js',
      state: { status: 'running', port: 12002, token: 't3' },
      customHosts: [],
    })

    expect(result).toEqual({
      resolvedUrl: 'http://127.0.0.1:12002/github/trending?language=js',
      token: 't3',
    })
  })

  it('命中 RSSHub URL 但服务不可用应抛结构化错误', () => {
    expect(() =>
      resolveRsshubUrl({
        url: 'https://rsshub.app/github/trending',
        state: { status: 'error', port: null, token: null },
        customHosts: [],
      }),
    ).toThrowError(/RSSHUB_LOCAL_UNAVAILABLE/)
  })
})
