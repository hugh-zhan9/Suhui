import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('FreeFolo branding', () => {
  it('desktop package productName 应为 FreeFolo', () => {
    const pkgPath = path.resolve(process.cwd(), 'apps/desktop/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

    expect(pkg.productName).toBe('FreeFolo')
    expect(pkg.name).toBe('FreeFolo')
  })

  it('renderer 全局 APP_NAME 应为 FreeFolo', () => {
    const globalPath = path.resolve(process.cwd(), 'apps/desktop/layer/renderer/global.d.ts')
    const content = readFileSync(globalPath, 'utf-8')

    expect(content).toContain('export const APP_NAME = "FreeFolo"')
  })
})
