import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("SuHui branding", () => {
  it("desktop package 应为溯洄品牌", () => {
    const pkgPath = path.resolve(process.cwd(), "package.json")
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))

    expect(pkg.productName).toBe("溯洄")
    expect(pkg.name).toBe("suhui")
  })

  it("renderer 全局 APP_NAME 应为溯洄", () => {
    const globalPath = path.resolve(process.cwd(), "layer/renderer/global.d.ts")
    const content = readFileSync(globalPath, "utf-8")

    expect(content).toContain('export const APP_NAME = "溯洄"')
  })

  it("主文案应为“溯源而读，回归纯粹”并移除 FreeFolo", () => {
    const indexHtmlPath = path.resolve(process.cwd(), "layer/renderer/index.html")
    const indexHtml = readFileSync(indexHtmlPath, "utf-8")

    expect(indexHtml).toContain("溯源而读，回归纯粹")
    expect(indexHtml).not.toContain("FreeFolo")
    expect(indexHtml).toContain('<link rel="icon" href="/icon.png?v=20260303" type="image/png" />')
    expect(indexHtml).not.toContain('href="/icon.svg"')
  })

  it("主进程数据库文件名应切换为 suhui_local.db", () => {
    const dbPath = path.resolve(process.cwd(), "layer/main/src/manager/db.ts")
    const content = readFileSync(dbPath, "utf-8")

    expect(content).toContain("suhui_local.db")
    expect(content).not.toContain("folo_local.db")
  })

  it("设置关于页应展示溯洄 (SuHui) 与新slogan", () => {
    const aboutPath = path.resolve(process.cwd(), "layer/renderer/src/modules/settings/tabs/about.tsx")
    const content = readFileSync(aboutPath, "utf-8")

    expect(content).toContain("溯洄 (SuHui)")
    expect(content).toContain("溯源而读，回归纯粹")
    expect(content).not.toContain("about.copyEnvironment")
    expect(content).not.toContain("about.checkForUpdates")
    expect(content).not.toContain("about.changelog")
    expect(content).not.toContain("<span className=\"mr-1.5 text-text-tertiary\">App</span>")
    expect(content).not.toContain("<span className=\"mr-1.5 text-text-tertiary\">Renderer</span>")
  })

  it("设置左上角与关于页应使用新的应用图标资源", () => {
    const aboutPath = path.resolve(process.cwd(), "layer/renderer/src/modules/settings/tabs/about.tsx")
    const modalLayoutPath = path.resolve(
      process.cwd(),
      "layer/renderer/src/modules/settings/modal/layout.tsx",
    )
    const aboutContent = readFileSync(aboutPath, "utf-8")
    const modalLayoutContent = readFileSync(modalLayoutPath, "utf-8")

    expect(aboutContent).toContain('const APP_ICON_SRC = "icon.png?v=20260303"')
    expect(modalLayoutContent).toContain('const APP_ICON_SRC = "icon.png?v=20260303"')
    expect(aboutContent).toContain('event.currentTarget.src = "icon.svg"')
    expect(modalLayoutContent).toContain('event.currentTarget.src = "icon.svg"')
    expect(aboutContent).not.toContain("@follow/components/icons/logo.jsx")
    expect(modalLayoutContent).not.toContain("@follow/components/icons/logo.jsx")
  })

  it("EntryNotFound 占位文案应为两行且不显示图标", () => {
    const placeholderPath = path.resolve(
      process.cwd(),
      "layer/renderer/src/components/errors/EntryNotFound.tsx",
    )
    const content = readFileSync(placeholderPath, "utf-8")

    expect(content).toContain("溯洄 (SuHui)")
    expect(content).toContain("溯源而读，回归纯粹")
    expect(content).toContain("text-[14px] font-medium text-zinc-500 dark:text-zinc-400")
    expect(content).not.toContain("@follow/components/icons/logo.jsx")
    expect(content).not.toContain("<Logo")
  })

  it("主界面 EntryPlaceholderLogo 应为两行文案且不显示图标", () => {
    const placeholderPath = path.resolve(
      process.cwd(),
      "layer/renderer/src/modules/entry-content/components/EntryPlaceholderLogo.tsx",
    )
    const content = readFileSync(placeholderPath, "utf-8")

    expect(content).toContain("溯洄 (SuHui)")
    expect(content).toContain("溯源而读，回归纯粹")
    expect(content).toContain("text-[14px] font-medium text-zinc-500 dark:text-zinc-400")
    expect(content).not.toContain("Welcome to 溯洄")
    expect(content).not.toContain("i-mgc-folo-bot-original")
  })

  it("renderer 公共目录应存在新图标文件", () => {
    const iconPath = path.resolve(process.cwd(), "layer/renderer/public/icon.png")
    expect(existsSync(iconPath)).toBe(true)
  })

  it("应用左上角头部应展示新图标与名称", () => {
    const headerPath = path.resolve(
      process.cwd(),
      "layer/renderer/src/modules/subscription-column/SubscriptionColumnHeader.tsx",
    )
    const content = readFileSync(headerPath, "utf-8")

    expect(content).toContain('const APP_ICON_SRC = "icon.png?v=20260303"')
    expect(content).toContain("溯洄 (SuHui)")
    expect(content).not.toContain("<Folo")
    expect(content).not.toContain("<Logo")
  })
})
