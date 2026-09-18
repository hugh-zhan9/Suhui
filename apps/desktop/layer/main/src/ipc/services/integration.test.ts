import fsp from "node:fs/promises"
import os from "node:os"

import { dialog, shell } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import path from "pathe"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IntegrationService } from "./integration"

const APP_PROTOCOL = "suhui"
const LEGACY_APP_PROTOCOL = "suhui"

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
}))

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) =>
    descriptor,
  IpcService: class {},
}))

// `@suhui/shared/constants` reads the `ELECTRON` build-time global at module
// scope, which only the electron-vite define provides.
vi.mock("@suhui/shared/constants", () => ({
  APP_PROTOCOL: "suhui",
  LEGACY_APP_PROTOCOL: "suhui",
}))

vi.mock("~/lib/i18n", () => ({
  t: (key: string) => key,
}))

vi.mock("~/lib/store", () => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock("~/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const context = {} as IpcContext

describe("IntegrationService", () => {
  let vaultPath: string | undefined

  afterEach(async () => {
    if (!vaultPath) return

    await fsp.rm(vaultPath, { force: true, recursive: true })
    vaultPath = undefined
  })

  it("saves a title containing a path separator as one flat markdown file", async () => {
    vaultPath = await fsp.mkdtemp(path.join(os.tmpdir(), "suhui-obsidian-"))
    const service = new IntegrationService()

    await expect(
      service.saveToObsidian(context, {
        url: "https://example.com",
        title: "Ratio 1/6 scale figure",
        content: "content",
        author: "Suhui",
        publishedAt: "2026-05-14T04:20:44.405Z",
        vaultPath,
      }),
    ).resolves.toEqual({ success: true })

    // The file name is sanitized first, then truncated to 20 characters.
    await expect(fsp.readdir(vaultPath)).resolves.toEqual(["Ratio 1_6 scale figu.md"])
    await expect(fsp.stat(path.join(vaultPath, "Ratio 1"))).rejects.toThrow()
  })

  // Entry titles come straight from untrusted feeds, and the file name is fed to
  // `path.join`, so separators must never survive sanitization.
  it("keeps a traversal-shaped title inside the vault", async () => {
    const parent = await fsp.mkdtemp(path.join(os.tmpdir(), "suhui-obsidian-parent-"))
    vaultPath = path.join(parent, "vault")
    await fsp.mkdir(vaultPath)
    const service = new IntegrationService()

    await expect(
      service.saveToObsidian(context, {
        url: "https://example.com",
        title: "../../escape",
        content: "content",
        author: "Suhui",
        publishedAt: "2026-05-14T04:20:44.405Z",
        vaultPath,
      }),
    ).resolves.toEqual({ success: true })

    await expect(fsp.readdir(vaultPath)).resolves.toEqual([".._.._escape.md"])
    await expect(fsp.readdir(parent)).resolves.toEqual(["vault"])

    vaultPath = parent
  })

  describe("openURLScheme", () => {
    const openExternalMock = vi.mocked(shell.openExternal)
    const showMessageBoxMock = vi.mocked(dialog.showMessageBox)

    beforeEach(() => {
      openExternalMock.mockReset()
      openExternalMock.mockResolvedValue()
      showMessageBoxMock.mockReset()
      showMessageBoxMock.mockResolvedValue({ checkboxChecked: false, response: 0 })
    })

    it("rejects input that cannot be parsed as a URL", async () => {
      const service = new IntegrationService()

      await expect(service.openURLScheme(context, "not-a-url")).rejects.toThrow(
        /Invalid URL scheme/i,
      )
      expect(openExternalMock).not.toHaveBeenCalled()
    })

    // These are the dangerous protocols that previously slipped through the
    // "contains ://" guard and reached shell.openExternal verbatim. The IPC is
    // reachable from any XSS sink in untrusted feed content, and these schemes
    // have real-world RCE / NTLM-credential-theft chains.
    it.each([
      ["file:///etc/passwd"],
      ["FILE:///etc/passwd"],
      ["smb://attacker.example/share"],
      ["jar:http://attacker.example/x.jar!/"],
      ["res://shell32.dll/1"],
      ["ms-msdt:/id PCWDiagnostic"],
      ["search-ms:query=secret"],
      ["javascript:alert(1)"],
      ["data:text/html,<script>alert(1)</script>"],
      ["vbscript:msgbox(1)"],
    ])(
      "blocks dangerous scheme %s and does not invoke shell.openExternal",
      async (dangerousScheme) => {
        const service = new IntegrationService()

        await expect(service.openURLScheme(context, dangerousScheme)).rejects.toThrow(
          /not allowed/i,
        )
        expect(showMessageBoxMock).not.toHaveBeenCalled()
        expect(openExternalMock).not.toHaveBeenCalled()
      },
    )

    // Schemes the integration settings ship as built-in examples, plus generic
    // web/mail. They must keep opening without an extra prompt.
    it.each([
      ["https://example.com"],
      ["http://example.com/path?q=1"],
      ["mailto:user@example.com"],
      ["obsidian://new?vault=MyVault&name=Test"],
      ["bear://x-callback-url/create?title=Test"],
      ["things:///add?title=Test"],
      ["notion://new?title=Test"],
      ["x-devonthink://createText?title=Test"],
      ["drafts://x-callback-url/create?text=Test"],
    ])("permits known integration scheme %s", async (allowedScheme) => {
      const service = new IntegrationService()

      await expect(service.openURLScheme(context, allowedScheme)).resolves.toEqual({
        success: true,
      })
      expect(showMessageBoxMock).not.toHaveBeenCalled()
      expect(openExternalMock).toHaveBeenCalledWith(allowedScheme)
    })

    // Custom integrations are free-form text in the settings UI, so any other
    // scheme stays usable but has to pass an explicit confirmation first.
    it.each([
      ["logseq://x-callback-url/open?title=Test"],
      ["my-app+folo.v2://open?title=Test"],
      ["MYAPP://open"],
      ["file-helper://open"],
    ])("permits user-defined integration scheme %s", async (customScheme) => {
      const service = new IntegrationService()

      await expect(service.openURLScheme(context, customScheme)).resolves.toEqual({
        success: true,
      })
      expect(showMessageBoxMock).toHaveBeenCalledOnce()
      expect(openExternalMock).toHaveBeenCalledWith(customScheme)
    })

    // Fork-specific: `app://` is registered as a privileged scheme that serves
    // local files into the renderer, and APP_PROTOCOL is registered with the OS
    // as this app's own deep-link handler. Neither may be reachable from a feed.
    it.each([
      ["app://suhui.io/etc/passwd"],
      [`${APP_PROTOCOL}://add?url=https://example.com`],
      [`${LEGACY_APP_PROTOCOL}://add?url=https://example.com`],
    ])("blocks our own protocol %s", async (ownScheme) => {
      const service = new IntegrationService()

      await expect(service.openURLScheme(context, ownScheme)).rejects.toThrow(/not allowed/i)
      expect(showMessageBoxMock).not.toHaveBeenCalled()
      expect(openExternalMock).not.toHaveBeenCalled()
    })

    it("does not open a user-defined integration scheme when confirmation is canceled", async () => {
      showMessageBoxMock.mockResolvedValue({ checkboxChecked: false, response: 1 })
      const service = new IntegrationService()

      await expect(service.openURLScheme(context, "logseq://open")).rejects.toThrow(/not opened/i)
      expect(showMessageBoxMock).toHaveBeenCalledOnce()
      expect(openExternalMock).not.toHaveBeenCalled()
    })
  })
})
