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
})
