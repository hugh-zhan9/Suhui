import { describe, expect, it } from "vitest"
import {
  getHydratePhaseState,
  markHydrateCriticalDone as markStoreHydrateCriticalDone,
  resetHydratePhases,
} from "@suhui/store/hydrate-phases"

import { appIsReady, getStartupReadiness } from "~/atoms/app"

import {
  beginStartupSession,
  getRouteScopeReadyAt,
  markDbUsable,
  markDesktopInitialEntriesTerminalError,
  markDesktopInitialEntriesReady,
  markHydrateCriticalDone,
  markReady,
  markRouteScopeReady,
  markShellReady,
  markSnapshotRestoreSettled,
  resetStartupReadinessForTests,
} from "./readiness"
import { getStartupCountMetricsForTests, getStartupMetricsForTests } from "./startup-metrics"

describe("startup readiness", () => {
  it("promotes interactive only after shell, db usable, and snapshot restore settle", () => {
    resetStartupReadinessForTests()
    resetHydratePhases()
    beginStartupSession("session-1")

    markShellReady()
    expect(getStartupReadiness().interactive).toBe(false)
    expect(appIsReady()).toBe(false)
    expect(getHydratePhaseState().phase).toBe("idle")

    markDbUsable()
    expect(getStartupReadiness().interactive).toBe(false)
    expect(getHydratePhaseState().phase).toBe("idle")

    markSnapshotRestoreSettled()

    expect(getStartupReadiness()).toMatchObject({
      shellReady: true,
      dbUsable: true,
      interactive: true,
      snapshotRestoreSettled: true,
      startupSessionId: "session-1",
    })
    expect(appIsReady()).toBe(true)
    expect(getHydratePhaseState()).toMatchObject({
      phase: "interactive",
      startupSessionId: "session-1",
      barrierActive: true,
    })
  })

  it("keeps hydrateCriticalDone and ready as explicit later phases", () => {
    resetStartupReadinessForTests()
    resetHydratePhases()
    beginStartupSession("session-2")

    markShellReady()
    markSnapshotRestoreSettled()
    markDbUsable()
    markHydrateCriticalDone()
    markReady()

    expect(getStartupReadiness()).toMatchObject({
      interactive: true,
      hydrateCriticalDone: true,
      ready: true,
    })
  })

  it("keeps interactive independent from metadata and initial entries", () => {
    resetStartupReadinessForTests()
    resetHydratePhases()
    beginStartupSession("session-independent")

    markShellReady()
    markDbUsable()
    markSnapshotRestoreSettled()

    expect(getStartupReadiness()).toMatchObject({
      interactive: true,
      routeScopeReady: false,
      desktopInitialEntriesReady: false,
    })
  })

  it("records route and initial-page readiness once", () => {
    resetStartupReadinessForTests()
    resetHydratePhases()
    beginStartupSession("session-readiness-metrics")
    markRouteScopeReady()
    markRouteScopeReady()
    markDesktopInitialEntriesReady(20)
    markDesktopInitialEntriesReady(0)

    expect(getStartupReadiness()).toMatchObject({
      routeScopeReady: true,
      desktopInitialEntriesReady: true,
    })
    expect(getStartupMetricsForTests().has("route_scope_ready_ms")).toBe(true)
    expect(getRouteScopeReadyAt()).toBe(getStartupMetricsForTests().get("route_scope_ready_ms"))
    expect(getStartupMetricsForTests().has("desktop_initial_entries_ready_ms")).toBe(true)
    expect(getStartupCountMetricsForTests().get("desktop_startup_entry_rows")).toBe(20)
  })

  it("resets route and initial-page readiness for a new startup session", () => {
    resetStartupReadinessForTests()
    resetHydratePhases()
    beginStartupSession("session-old")
    markRouteScopeReady()
    markDesktopInitialEntriesTerminalError()

    beginStartupSession("session-new")

    expect(getRouteScopeReadyAt()).toBeUndefined()
    expect(getStartupReadiness()).toMatchObject({
      routeScopeReady: false,
      desktopInitialEntriesReady: false,
      desktopInitialEntriesTerminalError: false,
      startupSessionId: "session-new",
    })

    markRouteScopeReady()
    markDesktopInitialEntriesReady(0)
    expect(getStartupCountMetricsForTests().get("desktop_startup_entry_rows")).toBe(0)
  })

  it("does not reopen the startup barrier when critical hydrate already finished", () => {
    resetStartupReadinessForTests()
    resetHydratePhases()
    beginStartupSession("session-3")
    markStoreHydrateCriticalDone()
    markHydrateCriticalDone()

    markShellReady()
    markDbUsable()
    markSnapshotRestoreSettled()

    expect(getStartupReadiness()).toMatchObject({
      interactive: true,
      hydrateCriticalDone: true,
    })
    expect(getHydratePhaseState()).toMatchObject({
      phase: "deferred",
      barrierActive: false,
    })
  })
})
