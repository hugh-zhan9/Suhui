import { describe, expect, it } from "vitest"
import {
  getHydratePhaseState,
  markHydrateCriticalDone as markStoreHydrateCriticalDone,
  resetHydratePhases,
} from "@suhui/store/hydrate-phases"

import { appIsReady, getStartupReadiness } from "~/atoms/app"

import {
  beginStartupSession,
  markDbUsable,
  markHydrateCriticalDone,
  markReady,
  markShellReady,
  markSnapshotRestoreSettled,
  resetStartupReadinessForTests,
} from "./readiness"

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
