import { describe, expect, it } from "vitest"

import { parseHtmlToHast } from "./html"

describe("translation presentation metadata", () => {
  it.each([false, true])(
    "preserves only the translation marker while retaining sanitization (noMedia: %s)",
    (noMedia) => {
      const tree = parseHtmlToHast(
        '<p data-suhui-translation="true" onclick="alert(1)">Translation<a href="javascript:alert(1)">link</a></p><p data-suhui-translation="arbitrary">Source</p><script>alert(1)</script>',
        { noMedia },
      )
      const output = JSON.stringify(tree)
      expect(output).toContain('"dataSuhuiTranslation":"true"')
      expect(output).not.toMatch(/onclick|onClick|javascript:|arbitrary|"tagName":"script"/)
    },
  )
  it("allows only a batch marker with a session id, leaving script/event filtering intact", () => {
    const id = "00000000-0000-0000-0000-000000000000:content:2"
    const tree = parseHtmlToHast(
      `<span data-suhui-translation-retry="${id}" onclick="alert(1)"></span><span data-suhui-translation-retry="arbitrary"></span>`,
    )
    const output = JSON.stringify(tree)
    expect(output).toContain(`"dataSuhuiTranslationRetry":"${id}"`)
    expect(output).not.toMatch(/onclick|onClick|arbitrary/)
  })
})
