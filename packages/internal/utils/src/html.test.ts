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

describe("Mermaid code block metadata", () => {
  it.each([false, true])(
    "retains only diagram pre classes without broadening sanitization (noMedia: %s)",
    (noMedia) => {
      const tree = parseHtmlToHast(
        '<pre class="not-prose mermaid injected" style="color:red" onclick="alert(1)">graph TD; A--&gt;B</pre><pre class="language-mermaid extra">graph TD; C--&gt;D</pre><pre><code class="language-mermaid">graph TD; E--&gt;F</code></pre><script>alert(1)</script>',
        { noMedia },
      )
      const output = JSON.stringify(tree)
      if (noMedia) {
        expect(output).not.toContain("mermaid")
        expect(output).toContain("graph TD; A-->B")
      } else {
        expect(output).toContain('"className":["mermaid"]')
        expect(output).toContain('"className":["language-mermaid"]')
      }
      expect(output).not.toMatch(
        /injected|not-prose|extra|color:red|onClick|onclick|"tagName":"script"/,
      )
    },
  )
})
