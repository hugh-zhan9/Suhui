import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  beginRemotePerformanceSession,
  markRemoteDataReadyIfComplete,
  markRemoteMetric,
} from "./remote-performance"

describe("remote performance metrics", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("records each metric once relative to the navigation start", () => {
    beginRemotePerformanceSession(100)

    expect(markRemoteMetric("remote_shell_visible_ms", 137.9)).toBe(37)
    expect(markRemoteMetric("remote_shell_visible_ms", 200)).toBe(37)
    expect(console.info).toHaveBeenCalledTimes(1)
    expect(console.info).toHaveBeenCalledWith(
      "[remote-performance]",
      expect.objectContaining({ name: "remote_shell_visible_ms", value: 37 }),
    )
  })

  it("does not record data ready until both successful states are complete", () => {
    beginRemotePerformanceSession(10)

    expect(
      markRemoteDataReadyIfComplete({ bootstrapReady: false, initialEntriesReady: true }),
    ).toBeNull()
    expect(
      markRemoteDataReadyIfComplete({ bootstrapReady: true, initialEntriesReady: false }),
    ).toBeNull()
    expect(console.info).not.toHaveBeenCalled()

    expect(
      markRemoteDataReadyIfComplete({ bootstrapReady: true, initialEntriesReady: true }),
    ).toBeGreaterThanOrEqual(0)
    expect(console.info).toHaveBeenCalledWith(
      "[remote-performance]",
      expect.objectContaining({ name: "remote_data_ready_ms" }),
    )
  })
})
