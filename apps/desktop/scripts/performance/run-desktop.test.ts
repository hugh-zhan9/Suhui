import assert from "node:assert/strict"
import { test } from "node:test"

test("freezes feed and unread query evidence in their matching samples", async () => {
  const module = await import("./run-desktop.ts")
  const sampleDesktopPhaseMetrics = (
    module as typeof module & {
      sampleDesktopPhaseMetrics?: (
        feedMetrics: ReadonlyMap<string, number>,
        unreadMetrics: ReadonlyMap<string, number>,
      ) => {
        durations: Record<string, number>
        metricsBySurface: Record<string, Record<string, number>>
      }
    }
  ).sampleDesktopPhaseMetrics

  assert.equal(typeof sampleDesktopPhaseMetrics, "function")
  const feedMetrics = new Map<string, number>([
    ["shell_ready_ms", 100],
    ["db_usable_ms", 140],
    ["interactive_ms", 170],
    ["route_scope_ready_ms", 180],
    ["desktop_initial_entries_ready_ms", 460],
    ["desktop_startup_entry_rows", 20],
    ["desktop_feed_usable_ms", 280],
    ["entry_query_duration_ms", 11],
    ["entry_query_rows", 20],
    ["entry_fetch_to_store_ms", 13],
  ])
  const unreadMetrics = new Map(feedMetrics)
  unreadMetrics.set("desktop_unread_usable_ms", 31)
  unreadMetrics.set("entry_query_duration_ms", 29)
  unreadMetrics.set("entry_query_rows", 7)
  unreadMetrics.set("entry_fetch_to_store_ms", 34)

  const result = sampleDesktopPhaseMetrics!(feedMetrics, unreadMetrics)

  assert.ok(result)
  assert.equal(result.durations["desktop-feed-usable"], 280)
  assert.equal(result.durations["desktop-unread-usable"], 31)
  assert.equal(result.metricsBySurface["desktop-feed-usable"]?.entry_query_duration_ms, 11)
  assert.equal(result.metricsBySurface["desktop-feed-usable"]?.entry_query_rows, 20)
  assert.equal(result.metricsBySurface["desktop-feed-usable"]?.entry_fetch_to_store_ms, 13)
  assert.equal(result.metricsBySurface["desktop-feed-usable"]?.desktop_unread_usable_ms, undefined)
  assert.equal(result.metricsBySurface["desktop-unread-usable"]?.entry_query_duration_ms, undefined)
  assert.equal(result.metricsBySurface["desktop-unread-usable"]?.entry_query_rows, undefined)
  assert.equal(result.metricsBySurface["desktop-unread-usable"]?.entry_fetch_to_store_ms, undefined)
  assert.equal(result.metricsBySurface["desktop-unread-usable"]?.desktop_unread_usable_ms, 31)
})
