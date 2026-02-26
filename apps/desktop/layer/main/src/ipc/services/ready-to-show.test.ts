import { describe, expect, it } from 'vitest'

import { shouldShowMainWindowOnReady } from './ready-to-show'

describe('shouldShowMainWindowOnReady', () => {
  it('首次启动且非隐藏启动时应显示主窗口', () => {
    expect(
      shouldShowMainWindowOnReady({
        wasOpenedAsHidden: false,
        startInTray: false,
        handledOnce: false,
      }),
    ).toBe(true)
  })

  it('非首次（如自动刷新后）不应再次 show 主窗口', () => {
    expect(
      shouldShowMainWindowOnReady({
        wasOpenedAsHidden: false,
        startInTray: false,
        handledOnce: true,
      }),
    ).toBe(false)
  })

  it('托盘启动时不应自动 show 主窗口', () => {
    expect(
      shouldShowMainWindowOnReady({
        wasOpenedAsHidden: false,
        startInTray: true,
        handledOnce: false,
      }),
    ).toBe(false)
  })
})
