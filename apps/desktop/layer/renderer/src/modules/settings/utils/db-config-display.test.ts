import { describe, expect, it } from "vitest"

import { formatDisplayList, formatDisplayValue } from "./db-config-display"

describe("db config display", () => {
  it("formats empty values with fallback", () => {
    expect(formatDisplayValue("", "N/A")).toBe("N/A")
    expect(formatDisplayValue(undefined, "N/A")).toBe("N/A")
  })

  it("formats list values with fallback", () => {
    expect(formatDisplayList([], "none")).toBe("none")
    expect(formatDisplayList(["a", "b"], "none")).toBe("a, b")
  })
})
