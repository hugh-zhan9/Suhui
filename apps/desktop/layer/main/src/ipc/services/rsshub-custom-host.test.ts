import { describe, expect, it } from "vitest"

import { extractRsshubCustomHosts } from "./rsshub-custom-host"

describe("extractRsshubCustomHosts", () => {
  it("应从合法 URL 提取主机名", () => {
    expect(extractRsshubCustomHosts("https://rsshub.myself.dev")).toEqual(["rsshub.myself.dev"])
    expect(extractRsshubCustomHosts("https://rsshub.myself.dev/path?x=1")).toEqual([
      "rsshub.myself.dev",
    ])
  })

  it("非法或空值应返回空数组", () => {
    expect(extractRsshubCustomHosts("")).toEqual([])
    expect(extractRsshubCustomHosts("not-a-url")).toEqual([])
    expect(extractRsshubCustomHosts(null)).toEqual([])
  })
})
