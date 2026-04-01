import "@suhui/components/tailwind"
import "./remote.css"

import { MotionProvider } from "@suhui/components/common/MotionProvider.jsx"
import { Toaster } from "@suhui/components/ui/toast/index.jsx"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { Provider } from "jotai"
import React from "react"
import ReactDOM from "react-dom/client"

import { queryClientContext } from "@suhui/store/context"
import { jotaiStore } from "~/lib/jotai"
import { persistConfig, queryClient } from "~/lib/query-client"

import { markRemoteRuntime } from "@suhui/store/remote"
import { hydrateFromRemote } from "@suhui/store/remote/hydrate"
import { RemoteApp } from "./remote-app"

// 标记远程运行时环境
markRemoteRuntime()
queryClientContext.provide(queryClient)

const container = document.querySelector("#root")

if (!container) {
  throw new Error("Remote root container not found")
}

// 初始化并渲染
const initRemote = async () => {
  try {
    // 从远程 API 加载初始数据
    await hydrateFromRemote()
  } catch (error) {
    console.error("[Remote] Failed to hydrate from remote:", error)
  }

  // 渲染应用
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <Provider store={jotaiStore}>
        <PersistQueryClientProvider persistOptions={persistConfig} client={queryClient}>
          <MotionProvider>
            <RemoteApp />
            <Toaster />
          </MotionProvider>
        </PersistQueryClientProvider>
      </Provider>
    </React.StrictMode>,
  )
}

void initRemote()
