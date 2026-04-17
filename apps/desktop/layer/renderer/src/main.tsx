import "./wdyr"
import "@suhui/components/tailwind"
import "./styles/main.css"

import { IN_ELECTRON } from "@suhui/shared/constants"
import { apiContext, authClientContext, queryClientContext } from "@suhui/store/context"
import { getOS } from "@suhui/utils/utils"
import * as React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "react-router/dom"

import { authClient } from "~/lib/auth"

import { ElECTRON_CUSTOM_TITLEBAR_HEIGHT } from "./constants"
import { initializeApp } from "./initialize"
import { registerAppGlobalShortcuts } from "./initialize/global-shortcuts"
import { markShellReady } from "./initialize/readiness"
import { followApi } from "./lib/api-client"
import { ipcServices } from "./lib/client"
import { queryClient } from "./lib/query-client"
import type { RendererErrorPayload } from "./lib/renderer-error-log"
import { buildRendererErrorPayload, buildRendererRejectionPayload } from "./lib/renderer-error-log"
import { router } from "./router"

authClientContext.provide(authClient)
queryClientContext.provide(queryClient)
apiContext.provide(followApi)

const reportRendererError = (payload: RendererErrorPayload) => {
  void ipcServices?.app
    .reportRendererError(payload)
    .catch((error) => console.error("[renderer-error] report failed", error))
}

window.addEventListener("error", (event) => {
  reportRendererError(
    buildRendererErrorPayload({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    }),
  )
})

window.addEventListener("unhandledrejection", (event) => {
  reportRendererError(buildRendererRejectionPayload({ reason: event.reason }))
})

const $container = document.querySelector("#root") as HTMLElement

if (IN_ELECTRON) {
  const os = getOS()

  switch (os) {
    case "Windows": {
      document.body.style.cssText += `--fo-window-padding-top: ${ElECTRON_CUSTOM_TITLEBAR_HEIGHT}px;`
      break
    }
    case "macOS": {
      document.body.style.cssText += `--fo-macos-traffic-light-width: 80px; --fo-macos-traffic-light-height: 30px;`
      break
    }
  }
  document.documentElement.dataset.os = getOS()
} else {
  registerAppGlobalShortcuts()
}

ReactDOM.createRoot($container).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)

initializeApp()
markShellReady()
