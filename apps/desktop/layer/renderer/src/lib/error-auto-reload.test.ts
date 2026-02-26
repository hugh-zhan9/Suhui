import { describe, expect, it } from 'vitest'

import { shouldAutoReloadDynamicImportError } from './error-auto-reload'

describe('shouldAutoReloadDynamicImportError', () => {
  it('Electron 环境下不应自动 reload，避免白屏闪烁', () => {
    const should = shouldAutoReloadDynamicImportError({
      message: 'Failed to fetch dynamically imported module: x',
      hasReloadedInSession: false,
      inElectron: true,
    })

    expect(should).toBe(false)
  })

  it('Web 环境且首次动态模块错误时应允许自动 reload', () => {
    const should = shouldAutoReloadDynamicImportError({
      message: 'Failed to fetch dynamically imported module: x',
      hasReloadedInSession: false,
      inElectron: false,
    })

    expect(should).toBe(true)
  })
})
