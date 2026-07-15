import { getHydratePhaseState, startHydrateInteractive } from "@suhui/store/hydrate-phases"
import {
  createInitialStartupReadinessState,
  getStartupReadiness,
  setAppIsReady,
  setStartupReadiness,
} from "~/atoms/app"

import {
  beginStartupMetricsSession,
  markStartupMetric,
  recordStartupCountMetric,
  resetStartupMetricsForTests,
} from "./startup-metrics"

const mergeReadinessState = (
  patch: Partial<ReturnType<typeof createInitialStartupReadinessState>>,
) => {
  setStartupReadiness((prev) => ({
    ...prev,
    shellReady: prev.shellReady || !!patch.shellReady,
    dbUsable: prev.dbUsable || !!patch.dbUsable,
    interactive: prev.interactive || !!patch.interactive,
    routeScopeReady: prev.routeScopeReady || !!patch.routeScopeReady,
    desktopInitialEntriesReady:
      prev.desktopInitialEntriesReady || !!patch.desktopInitialEntriesReady,
    desktopInitialEntriesTerminalError:
      prev.desktopInitialEntriesTerminalError || !!patch.desktopInitialEntriesTerminalError,
    hydrateCriticalDone: prev.hydrateCriticalDone || !!patch.hydrateCriticalDone,
    ready: prev.ready || !!patch.ready,
    snapshotRestoreSettled: prev.snapshotRestoreSettled || !!patch.snapshotRestoreSettled,
    startupSessionId: patch.startupSessionId ?? prev.startupSessionId,
  }))
}

let pendingHydrateCriticalDone = false
let pendingReady = false
let routeScopeReadyAt: number | undefined

const applyPendingLaterPhases = () => {
  const state = getStartupReadiness()

  if (pendingHydrateCriticalDone && state.interactive && !state.hydrateCriticalDone) {
    pendingHydrateCriticalDone = false
    mergeReadinessState({ hydrateCriticalDone: true })
    markStartupMetric("hydrate_critical_done_ms")
  }

  const nextState = getStartupReadiness()
  if (pendingReady && nextState.interactive && nextState.hydrateCriticalDone && !nextState.ready) {
    pendingReady = false
    mergeReadinessState({ ready: true })
    markStartupMetric("ready_ms")
  }
}

const maybePromoteInteractive = () => {
  const state = getStartupReadiness()

  if (state.interactive) {
    return false
  }

  if (!(state.shellReady && state.dbUsable && state.snapshotRestoreSettled)) {
    return false
  }

  if (getHydratePhaseState().phase === "idle") {
    startHydrateInteractive(state.startupSessionId ?? undefined)
  }
  mergeReadinessState({ interactive: true })
  setAppIsReady(true)
  markStartupMetric("interactive_ms")
  applyPendingLaterPhases()
  return true
}

export const createStartupSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `startup-${Date.now()}`
}

export const beginStartupSession = (startupSessionId: string) => {
  pendingHydrateCriticalDone = false
  pendingReady = false
  routeScopeReadyAt = undefined
  beginStartupMetricsSession()
  setAppIsReady(false)
  setStartupReadiness({
    ...createInitialStartupReadinessState(),
    startupSessionId,
  })
}

export const markShellReady = () => {
  if (!getStartupReadiness().shellReady) {
    mergeReadinessState({ shellReady: true })
    markStartupMetric("shell_ready_ms")
  }

  maybePromoteInteractive()
}

export const markDbUsable = () => {
  if (!getStartupReadiness().dbUsable) {
    mergeReadinessState({ dbUsable: true })
    markStartupMetric("db_usable_ms")
  }

  maybePromoteInteractive()
}

export const markSnapshotRestoreSettled = () => {
  if (!getStartupReadiness().snapshotRestoreSettled) {
    mergeReadinessState({ snapshotRestoreSettled: true })
  }

  maybePromoteInteractive()
}

export const markRouteScopeReady = () => {
  if (getStartupReadiness().routeScopeReady) {
    return
  }

  routeScopeReadyAt = markStartupMetric("route_scope_ready_ms")
  mergeReadinessState({ routeScopeReady: true })
}

export const getRouteScopeReadyAt = () => routeScopeReadyAt

export const markDesktopInitialEntriesReady = (entryRows: number) => {
  if (getStartupReadiness().desktopInitialEntriesReady) {
    return
  }

  recordStartupCountMetric("desktop_startup_entry_rows", entryRows)
  mergeReadinessState({ desktopInitialEntriesReady: true })
  markStartupMetric("desktop_initial_entries_ready_ms")
}

export const markDesktopInitialEntriesTerminalError = () => {
  const state = getStartupReadiness()
  if (state.desktopInitialEntriesReady || state.desktopInitialEntriesTerminalError) {
    return
  }

  mergeReadinessState({ desktopInitialEntriesTerminalError: true })
}

export const markHydrateCriticalDone = () => {
  const state = getStartupReadiness()
  if (!state.interactive) {
    pendingHydrateCriticalDone = true
    return
  }

  if (!state.hydrateCriticalDone) {
    mergeReadinessState({ hydrateCriticalDone: true })
    markStartupMetric("hydrate_critical_done_ms")
    applyPendingLaterPhases()
  }
}

export const markReady = () => {
  const state = getStartupReadiness()
  if (!(state.interactive && state.hydrateCriticalDone)) {
    pendingReady = true
    return
  }

  if (!state.ready) {
    mergeReadinessState({ ready: true })
    markStartupMetric("ready_ms")
  }
}

export const resetStartupReadinessForTests = () => {
  pendingHydrateCriticalDone = false
  pendingReady = false
  routeScopeReadyAt = undefined
  setStartupReadiness(createInitialStartupReadinessState())
  setAppIsReady(false)
  resetStartupMetricsForTests()
}
