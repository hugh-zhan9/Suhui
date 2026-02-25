import "./wdyr"
import "@follow/components/tailwind"
import "./styles/main.css"

import { IN_ELECTRON } from "@follow/shared/constants"
import { apiContext, authClientContext, queryClientContext } from "@follow/store/context"
import { getOS } from "@follow/utils/utils"
import * as React from "react"
import { flushSync } from "react-dom"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "react-router/dom"

import { authClient } from "~/lib/auth"

import { setAppIsReady } from "./atoms/app"
import { ElECTRON_CUSTOM_TITLEBAR_HEIGHT } from "./constants"
import { initializeApp } from "./initialize"
import { registerAppGlobalShortcuts } from "./initialize/global-shortcuts"
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

initializeApp().finally(() => {
  // eslint-disable-next-line @eslint-react/dom/no-flush-sync
  flushSync(() => setAppIsReady(true))
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
