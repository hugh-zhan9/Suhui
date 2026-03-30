import { isMobile } from "@suhui/components/hooks/useMobile.js"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { tracker } from "@suhui/tracker"
import { nextFrame } from "@suhui/utils"
import { cn, getOS } from "@suhui/utils/utils"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Outlet } from "react-router"

import { useAppIsReady } from "./atoms/app"
import { useUISettingKey } from "./atoms/settings/ui"
import { applyAfterReadyCallbacks } from "./initialize/queue"
import { removeAppSkeleton } from "./lib/app"
import { ipcServices } from "./lib/client"
import { appLog } from "./lib/log"
import { useSettingSync } from "./hooks/biz/useSettingSync"
import { Titlebar } from "./modules/app/Titlebar"
import { RootProviders } from "./providers/root-providers"

function App() {
  const windowsElectron = IN_ELECTRON && getOS() === "Windows"
  return (
    <RootProviders>
      {IN_ELECTRON && (
        <div
          className={cn(
            "drag-region fixed inset-x-0 top-0 h-12 shrink-0",
            windowsElectron && "pointer-events-none z-[9999]",
          )}
          aria-hidden
        >
          {windowsElectron && <Titlebar />}
        </div>
      )}

      <AppLayer />
    </RootProviders>
  )
}

const AppLayer = () => {
  const appIsReady = useAppIsReady()
  useSettingSync()

  const onceReady = useRef(false)
  useLayoutEffect(() => {
    if (appIsReady && !onceReady.current) {
      onceReady.current = true
      ipcServices?.app.readyToShowMainWindow()
      nextFrame(removeAppSkeleton)
    }
  }, [appIsReady])

  useEffect(() => {
    const doneTime = Math.trunc(performance.now())
    tracker.uiRenderInit(doneTime)
    appLog("App is ready", `${doneTime}ms`)
    applyAfterReadyCallbacks()

    if (isMobile()) {
      const handler = (e: MouseEvent) => {
        e.preventDefault()
      }
      document.addEventListener("contextmenu", handler)

      return () => {
        document.removeEventListener("contextmenu", handler)
      }
    }
  }, [appIsReady])

  return appIsReady ? <Outlet /> : <AppSkeleton />
}

const AppSkeleton = () => {
  const feedColWidth = useUISettingKey("feedColWidth")
  const [dbStatus, setDbStatus] = useState<{
    ready: boolean
    initializing: boolean
    backgroundMode: boolean
    lastError: string | null
    lastAttempt: number
    maxAttempts: number
    dialect: string
  } | null>(null)

  useEffect(() => {
    if (!IN_ELECTRON) return

    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const loadStatus = async () => {
      try {
        const nextStatus = await ipcServices?.app.getDatabaseStatus?.()
        if (!active || !nextStatus) return
        setDbStatus(nextStatus)

        if (!nextStatus.ready) {
          timer = setTimeout(loadStatus, 1500)
        }
      } catch {
        if (!active) return
        timer = setTimeout(loadStatus, 1500)
      }
    }

    void loadStatus()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <div className="flex size-full bg-neutral-50 text-neutral-900">
      <div
        className="h-full shrink-0 bg-sidebar"
        style={{
          width: `${feedColWidth}px`,
        }}
      />
      <div className="flex min-w-0 flex-1 items-center justify-center px-8">
        <div className="w-full max-w-xl rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Suhui
          </div>
          <h1 className="text-2xl font-semibold text-neutral-950">正在连接数据库</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            应用已经启动，正在后台连接 Postgres
            并加载本地订阅数据。数据库连上后，这个页面会自动消失。
          </p>

          {dbStatus && (
            <div className="mt-6 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-700">
              <div>数据库类型：{dbStatus.dialect}</div>
              <div>
                当前状态：
                {dbStatus.ready ? "已连接" : dbStatus.initializing ? "重试连接中" : "等待初始化"}
              </div>
              <div>
                重试进度：{dbStatus.lastAttempt}/{dbStatus.maxAttempts}
              </div>
              {dbStatus.lastError && (
                <div className="mt-3 break-all rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                  最近错误：{dbStatus.lastError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export { App as Component }
