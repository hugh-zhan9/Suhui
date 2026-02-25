import { env } from "@follow/shared/env.desktop"
import { createDesktopAPIHeaders } from "@follow/utils/headers"
import { FollowClient } from "@follow-app/client-sdk"
import PKG from "@pkg"

import { NetworkStatus, setApiStatus } from "~/atoms/network"

import { getClientId, getSessionId } from "./client-session"

export const followClient = new FollowClient({
  credentials: "include",
  timeout: 30000,
  baseURL: env.VITE_API_URL,
  fetch: async (input, options = {}) =>
    fetch(input.toString(), {
      ...options,
      cache: "no-store",
    }),
})

export const followApi = followClient.api
followClient.addRequestInterceptor(async (ctx) => {
  const { options } = ctx
  const header = options.headers || {}
  header["X-Client-Id"] = getClientId()
  header["X-Session-Id"] = getSessionId()

  const apiHeader = createDesktopAPIHeaders({ version: PKG.version })

  options.headers = {
    ...header,
    ...apiHeader,
  }
  return ctx
})

followClient.addResponseInterceptor(({ response }) => {
  setApiStatus(NetworkStatus.ONLINE)
  return response
})

followClient.addErrorInterceptor(async ({ error, response }) => {
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

followClient.addResponseInterceptor(async ({ response }) => {
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
