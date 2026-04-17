import { FollowAPIError } from "@follow-app/client-sdk"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"
import type { OmitKeyof } from "@tanstack/react-query"
import { QueryClient } from "@tanstack/react-query"
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client"
import { FetchError } from "ofetch"

import { QUERY_PERSIST_KEY } from "../constants/app"

const defaultStaleTime = 600_000 // 10min
const rendererPersistResetHooks = new Set<() => Promise<void> | void>()
const DO_NOT_RETRY_CODES = new Set([400, 401, 403, 404, 422, 402])
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retryDelay: 1000,
      staleTime: defaultStaleTime,
      retry(failureCount, error) {
        if (
          error instanceof FetchError &&
          (error.statusCode === undefined || DO_NOT_RETRY_CODES.has(error.statusCode))
        ) {
          return false
        }

        if (error instanceof FollowAPIError && DO_NOT_RETRY_CODES.has(error.status)) {
          return false
        }

        return !!(3 - failureCount)
      },
      // throwOnError: import.meta.env.DEV,
    },
  },
})
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: QUERY_PERSIST_KEY,
})

declare module "@tanstack/react-query" {
  interface Meta {
    queryMeta: { persist?: boolean }
  }

  interface Register extends Meta {}
}

export const persistConfig: OmitKeyof<PersistQueryClientOptions, "queryClient"> = {
  persister: localStoragePersister,
  // 7 day
  maxAge: 7 * 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (!query.meta?.persist) return false
      const queryIsReadyForPersistence = query.state.status === "success"
      if (queryIsReadyForPersistence) {
        return (
          !((query.state?.data as any)?.pages?.length > 1) && query.queryKey?.[0] !== "check-eagle"
        )
      } else {
        return false
      }
    },
  },
}

export const removePersistedQueryCache = () => {
  globalThis.localStorage?.removeItem(QUERY_PERSIST_KEY)
}

export const registerRendererPersistResetHook = (hook: () => Promise<void> | void) => {
  rendererPersistResetHooks.add(hook)

  return () => {
    rendererPersistResetHooks.delete(hook)
  }
}

export const clearRendererQueryCache = async () => {
  for (const hook of [...rendererPersistResetHooks]) {
    await hook()
  }

  await queryClient.cancelQueries()
  queryClient.clear()
  removePersistedQueryCache()
}

export { queryClient }
