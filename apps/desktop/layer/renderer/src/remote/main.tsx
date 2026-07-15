import "@suhui/components/tailwind"
import "./remote.css"

import { MotionProvider } from "@suhui/components/common/MotionProvider.jsx"
import { Toaster } from "@suhui/components/ui/toast/index.jsx"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { Provider } from "jotai"
import ReactDOM from "react-dom/client"

import { queryClientContext } from "@suhui/store/context"
import { jotaiStore } from "~/lib/jotai"
import { persistConfig, queryClient } from "~/lib/query-client"

import { markRemoteRuntime } from "@suhui/store/remote"
import { RemoteApp } from "./remote-app"
import { beginRemotePerformanceSession } from "./remote-performance"

// 标记远程运行时环境
markRemoteRuntime()
queryClientContext.provide(queryClient)
beginRemotePerformanceSession()

const container = document.querySelector("#root")

if (!container) {
  throw new Error("Remote root container not found")
}

ReactDOM.createRoot(container).render(
  <Provider store={jotaiStore}>
    <PersistQueryClientProvider persistOptions={persistConfig} client={queryClient}>
      <MotionProvider>
        <RemoteApp />
        <Toaster />
      </MotionProvider>
    </PersistQueryClientProvider>
  </Provider>,
)
