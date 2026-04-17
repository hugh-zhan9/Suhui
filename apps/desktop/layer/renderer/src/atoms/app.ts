import { WindowState } from "@suhui/shared/bridge"
import { atom } from "jotai"

import { createAtomHooks } from "~/lib/jotai"

export type StartupReadinessState = {
  shellReady: boolean
  dbUsable: boolean
  interactive: boolean
  hydrateCriticalDone: boolean
  ready: boolean
  snapshotRestoreSettled: boolean
  startupSessionId: string | null
}

export const createInitialStartupReadinessState = (): StartupReadinessState => ({
  shellReady: false,
  dbUsable: false,
  interactive: false,
  hydrateCriticalDone: false,
  ready: false,
  snapshotRestoreSettled: false,
  startupSessionId: null,
})

export const [, , useStartupReadiness, , getStartupReadiness, setStartupReadiness] =
  createAtomHooks(atom<StartupReadinessState>(createInitialStartupReadinessState()))

export const [, , useAppIsReady, , appIsReady, setAppIsReady] = createAtomHooks(atom(false))
export const [, , useAppMessagingToken, , appMessagingToken, setAppMessagingToken] =
  createAtomHooks(atom<string | null>(null))

export const [, , useAppSearchOpen, , , setAppSearchOpen] = createAtomHooks(atom(false))

// For electron
export const [, , useWindowState, , windowState, setWindowState] = createAtomHooks(
  atom<WindowState>(WindowState.NORMAL),
)
