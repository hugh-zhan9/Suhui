import { useEffect, useState } from "react"

export const useStartupFrameDeferredMount = ({
  inElectron,
  desktopInitialEntriesReady,
  desktopInitialEntriesTerminalError,
  startupSessionId,
}: {
  inElectron: boolean
  desktopInitialEntriesReady: boolean
  desktopInitialEntriesTerminalError: boolean
  startupSessionId: string | null
}) => {
  const [mountState, setMountState] = useState(() => ({
    startupSessionId,
    shouldMount: !inElectron || desktopInitialEntriesReady,
  }))
  const stateMatchesSession = mountState.startupSessionId === startupSessionId
  const shouldMount =
    !inElectron || (stateMatchesSession ? mountState.shouldMount : desktopInitialEntriesReady)

  useEffect(() => {
    const stateMatchesSession = mountState.startupSessionId === startupSessionId

    if (!inElectron || (!stateMatchesSession && desktopInitialEntriesReady)) {
      setMountState((current) =>
        current.startupSessionId === startupSessionId && current.shouldMount
          ? current
          : { startupSessionId, shouldMount: true },
      )
      return
    }

    if (!stateMatchesSession && !desktopInitialEntriesTerminalError) {
      setMountState({ startupSessionId, shouldMount: false })
      return
    }

    if (
      (stateMatchesSession && mountState.shouldMount) ||
      !(desktopInitialEntriesReady || desktopInitialEntriesTerminalError)
    ) {
      return
    }

    const frameId = requestAnimationFrame(() =>
      setMountState({ startupSessionId, shouldMount: true }),
    )
    return () => cancelAnimationFrame(frameId)
  }, [
    desktopInitialEntriesReady,
    desktopInitialEntriesTerminalError,
    inElectron,
    mountState,
    startupSessionId,
  ])

  return shouldMount
}
