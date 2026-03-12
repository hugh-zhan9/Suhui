import { env } from "@suhui/shared/env.desktop"
import { createDesktopAPIHeaders } from "@suhui/utils/headers"
import { FollowClient } from "@follow-app/client-sdk"
import PKG from "@pkg"

import { NetworkStatus, setApiStatus } from "~/atoms/network"

import { getClientId, getSessionId } from "./client-session"

export const DISCOVER_API_BASE_URL = "https://api.folo.is"

export const getDiscoverApiBaseURL = () => DISCOVER_API_BASE_URL

const createClient = (
  baseURL: string,
  options?: {
    credentials?: RequestCredentials
  },
) =>
  new FollowClient({
    credentials: options?.credentials ?? "include",
    timeout: 30000,
    baseURL,
    fetch: async (input, options = {}) =>
      fetch(input.toString(), {
        ...options,
        cache: "no-store",
      }),
  })

const registerClientInterceptors = (client: FollowClient) => {
  client.addRequestInterceptor(async (ctx) => {
    const { options: requestOptions } = ctx
    const header = requestOptions.headers || {}
    header["X-Client-Id"] = getClientId()
    header["X-Session-Id"] = getSessionId()

    const apiHeader = createDesktopAPIHeaders({ version: PKG.version })

    requestOptions.headers = {
      ...header,
      ...apiHeader,
    }
    return ctx
  })

  client.addResponseInterceptor(({ response }) => {
    setApiStatus(NetworkStatus.ONLINE)
    return response
  })

  client.addErrorInterceptor(async ({ error, response }) => {
    // If api is down
    if ((!response || response.status === 0) && navigator.onLine) {
      setApiStatus(NetworkStatus.OFFLINE)
    } else {
      setApiStatus(NetworkStatus.ONLINE)
    }

    if (!response) {
      return error
    }

    return error
  })

  client.addResponseInterceptor(async ({ response }) => {
    try {
      const isJSON = response.headers.get("content-type")?.includes("application/json")
      if (!isJSON) return response
      const _json = await response.clone().json()

      const isError = response.status >= 400
      if (!isError) return response
    } catch {
      // ignore
    }

    return response
  })
}

export const followClient = createClient(env.VITE_API_URL)
export const discoverClient = createClient(getDiscoverApiBaseURL(), { credentials: "omit" })
registerClientInterceptors(followClient)
registerClientInterceptors(discoverClient)

export const followApi = followClient.api
