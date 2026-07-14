import { beforeEach, describe, expect, it, vi } from "vitest"

import { appLog } from "~/lib/log"

import {
  getStartupCountMetricsForTests,
  getStartupMetricsForTests,
  recordStartupCountMetric,
  recordStartupMetric,
  resetStartupMetricsForTests,
} from "./startup-metrics"

vi.mock("~/lib/log", () => ({ appLog: vi.fn() }))

describe("startup metrics", () => {
  beforeEach(() => {
    resetStartupMetricsForTests()
    vi.mocked(appLog).mockClear()
  })

  it("records route and initial-page duration metrics with first-write-wins semantics", () => {
    recordStartupMetric("route_scope_ready_ms", 12.9)
    recordStartupMetric("route_scope_ready_ms", 99)
    recordStartupMetric("desktop_initial_entries_ready_ms", 34.8)

    expect(getStartupMetricsForTests()).toEqual(
      new Map([
        ["route_scope_ready_ms", 12],
        ["desktop_initial_entries_ready_ms", 34],
      ]),
    )
  })

  it("records one finite non-negative integer row count without payload fields", () => {
    recordStartupCountMetric("desktop_startup_entry_rows", 20)
    recordStartupCountMetric("desktop_startup_entry_rows", 0)

    expect(getStartupCountMetricsForTests()).toEqual(new Map([["desktop_startup_entry_rows", 20]]))
    expect(appLog).toHaveBeenCalledWith("[startup] desktop_startup_entry_rows", "20")
    expect(JSON.stringify(vi.mocked(appLog).mock.calls)).not.toMatch(
      /title|content|body|url|sql|connection|path/i,
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
    "rejects an unsafe startup row count: %s",
    (value) => {
      expect(() => recordStartupCountMetric("desktop_startup_entry_rows", value)).toThrow(
        "finite non-negative integer",
      )
      expect(getStartupCountMetricsForTests()).toEqual(new Map())
      expect(appLog).not.toHaveBeenCalled()
    },
  )

  it("resets duration and count metrics together", () => {
    recordStartupMetric("route_scope_ready_ms", 12)
    recordStartupCountMetric("desktop_startup_entry_rows", 20)

    resetStartupMetricsForTests()

    expect(getStartupMetricsForTests()).toEqual(new Map())
    expect(getStartupCountMetricsForTests()).toEqual(new Map())
  })
})
