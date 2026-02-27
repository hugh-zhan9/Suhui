import { describe, expect, it, vi } from 'vitest'

import { createRsshubManager, type RsshubProcessLike } from './rsshub'

const createMockProcess = (): RsshubProcessLike => {
  let exitHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null

  return {
    kill: vi.fn(),
    on: vi.fn((event, handler) => {
      if (event === 'exit') {
        exitHandler = handler as (code: number | null, signal: NodeJS.Signals | null) => void
      }
      return undefined
    }),
    emitExit: (code = 1, signal: NodeJS.Signals | null = null) => {
      exitHandler?.(code, signal)
    },
  }
}

describe('RsshubManager', () => {
  it('启动成功后应进入 running 状态并返回端口', async () => {
    const process = createMockProcess()
    const manager = createRsshubManager({
      createPort: async () => 18080,
      createToken: () => 'token-1',
      launch: async () => process,
      healthCheck: async () => true,
      maxRetries: 3,
      retryDelaysMs: [1, 2, 3],
    })

    const result = await manager.start()

    expect(result.port).toBe(18080)
    expect(result.token).toBe('token-1')
    expect(manager.getState().status).toBe('running')
    expect(manager.getState().port).toBe(18080)
  })

  it('已运行时 ensureRunning 应直接返回端口且不重复启动', async () => {
    const process = createMockProcess()
    const launch = vi.fn(async () => process)

    const manager = createRsshubManager({
      createPort: async () => 18081,
      createToken: () => 'token-2',
      launch,
      healthCheck: async () => true,
      maxRetries: 3,
      retryDelaysMs: [1, 2, 3],
    })

    await manager.start()
    const port = await manager.ensureRunning()

    expect(port).toBe(18081)
    expect(launch).toHaveBeenCalledTimes(1)
  })

  it('超过最大重试后应进入 cooldown', async () => {
    vi.useFakeTimers()

    const process = createMockProcess()
    const manager = createRsshubManager({
      createPort: async () => 18082,
      createToken: () => 'token-3',
      launch: async () => process,
      healthCheck: async () => false,
      maxRetries: 1,
      retryDelaysMs: [100],
      cooldownMs: 5000,
    })

    await expect(manager.start()).rejects.toThrow('RSSHub health check failed')

    expect(manager.getState().status).toBe('error')

    await vi.advanceTimersByTimeAsync(100)

    expect(manager.getState().status).toBe('cooldown')
    expect(manager.getState().cooldownUntil).not.toBeNull()

    vi.useRealTimers()
  })
})
