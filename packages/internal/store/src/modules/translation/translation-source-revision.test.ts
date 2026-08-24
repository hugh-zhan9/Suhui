import { describe, expect, it } from "vitest"

import { getTranslationSourceRevision } from "./hooks"

describe("translation source revision", () => {
  const source = {
    title: "Title",
    description: "Description",
    content: "<p>Body</p>",
    readabilityContent: null,
  }

  it("is stable for identical source fields", () => {
    expect(getTranslationSourceRevision(source as any)).toBe(
      getTranslationSourceRevision({ ...source } as any),
    )
  })

  it.each(["title", "description", "content", "readabilityContent"] as const)(
    "changes when %s changes",
    (field) => {
      expect(getTranslationSourceRevision({ ...source, [field]: "changed" } as any)).not.toBe(
        getTranslationSourceRevision(source as any),
      )
    },
  )
})
