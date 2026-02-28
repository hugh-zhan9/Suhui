import { describe, expect, it } from "vitest"

import { shouldRenderGridSkeleton } from "./grid-utils"

describe("shouldRenderGridSkeleton", () => {
  it("容器宽度未知时应显示骨架，避免白屏", () => {
    expect(shouldRenderGridSkeleton(0)).toBe(true)
    expect(shouldRenderGridSkeleton(-1)).toBe(true)
  })

  it("容器宽度有效时不显示骨架", () => {
    expect(shouldRenderGridSkeleton(1)).toBe(false)
  })
})
