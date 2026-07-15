import {
  applyRemoteBootstrapInSession,
  beginRemoteBootstrapLoading,
  failRemoteBootstrapLoading,
  remoteSSEHandler,
  type RemoteBootstrapPhase,
} from "@suhui/store/remote"
import { runtimeClient } from "@suhui/store/runtime"
import { useCallback, useEffect, useState } from "react"

import { markRemoteMetric } from "./remote-performance"

export type RemoteBootstrapViewState = {
  phase: RemoteBootstrapPhase
  error: string | null
  retry(): void
}

export type RemoteConnectionPhase = "connecting" | "connected" | "disconnected"

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Remote metadata could not be loaded"

export const useRemoteBootstrap = (): RemoteBootstrapViewState => {
  const [attempt, setAttempt] = useState(0)
  const [viewState, setViewState] = useState<Omit<RemoteBootstrapViewState, "retry">>({
    phase: "loading",
    error: null,
  })

  useEffect(() => {
    let active = true
    beginRemoteBootstrapLoading()
    setViewState({ phase: "loading", error: null })

    runtimeClient.bootstrap.get().then(
      (payload) => {
        if (!active) return
        try {
          applyRemoteBootstrapInSession(payload)
          setViewState({ phase: "ready", error: null })
        } catch (error) {
          failRemoteBootstrapLoading(error)
          setViewState({ phase: "error", error: toErrorMessage(error) })
        }
      },
      (error) => {
        if (!active) return
        failRemoteBootstrapLoading(error)
        setViewState({ phase: "error", error: toErrorMessage(error) })
      },
    )

    return () => {
      active = false
    }
  }, [attempt])

  useEffect(() => {
    if (viewState.phase === "ready") markRemoteMetric("remote_bootstrap_ready_ms")
    if (viewState.phase === "error") markRemoteMetric("remote_bootstrap_error_visible_ms")
  }, [viewState.phase])

  const retry = useCallback(() => setAttempt((current) => current + 1), [])
  return { ...viewState, retry }
}

export const useRemoteConnection = (): RemoteConnectionPhase => {
  const [phase, setPhase] = useState<RemoteConnectionPhase>("connecting")

  useEffect(() => {
    let acceptDisconnected = false
    remoteSSEHandler.setHandlers({
      onConnectionChange: (connected) => {
        if (!connected && !acceptDisconnected) return
        setPhase(connected ? "connected" : "disconnected")
      },
    })
    acceptDisconnected = true
    remoteSSEHandler.connect()

    return () => {
      remoteSSEHandler.setHandlers({ onConnectionChange: () => {} })
      remoteSSEHandler.disconnect()
    }
  }, [])

  return phase
}
