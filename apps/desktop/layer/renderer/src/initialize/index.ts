import { initializeDayjs } from "@suhui/components/dayjs"
import { registerGlobalContext } from "@suhui/shared/bridge"
import { DEV, ELECTRON_BUILD, IN_ELECTRON } from "@suhui/shared/constants"
import { hydrateCriticalToStore, hydrateDeferredToStore } from "@suhui/store/hydrate"
import { tracker } from "@suhui/tracker"
import { repository } from "@pkg"
import { enableMapSet } from "immer"

import { initI18n } from "~/i18n"
import { settingSyncQueue } from "~/modules/settings/helper/sync-queue"
import { ElectronCloseEvent, ElectronShowEvent } from "~/providers/invalidate-query-provider"

import { subscribeNetworkStatus } from "../atoms/network"
import { appLog } from "../lib/log"
import { initAnalytics } from "./analytics"
import { registerHistoryStack } from "./history"
import { doMigration } from "./migrates"
import {
  beginStartupSession,
  createStartupSessionId,
  markHydrateCriticalDone,
  markReady,
  markSnapshotRestoreSettled,
} from "./readiness"
import { initializeSettings } from "./settings"
import {
  forceStartupSnapshotRefresh,
  initializeStartupSnapshot,
  restoreStartupSnapshot,
} from "./startup-snapshot"

declare global {
  interface Window {
    version: string
  }
}

export const initializeApp = () => {
  appLog(`${APP_NAME}: 溯源而读，回归纯粹`, repository.url)

  if (DEV) {
    const url = "/favicon-dev.ico"

    // Change favicon
    const $icon = document.head.querySelector("link[rel='icon']")
    if ($icon) {
      $icon.setAttribute("href", url)
    } else {
      const icon = document.createElement("link")
      icon.setAttribute("rel", "icon")
      icon.setAttribute("href", url)
      document.head.append(icon)
    }
  }

  appLog(`Initialize ${APP_NAME}...`)
  window.version = APP_VERSION

  const startedAt = performance.now()
  const startupSessionId = createStartupSessionId()

  beginStartupSession(startupSessionId)
  initializeStartupSnapshot({ startupSessionId })

  initializeDayjs()
  registerHistoryStack()

  // Set Environment
  document.documentElement.dataset.buildType = ELECTRON_BUILD ? "electron" : "web"

  // Register global context for electron
  registerGlobalContext({
    /**
     * Electron app only
     */
    onWindowClose() {
      document.dispatchEvent(new ElectronCloseEvent())
    },
    onWindowShow() {
      document.dispatchEvent(new ElectronShowEvent())
    },
  })

  apm("migration", doMigration)

  // Enable Map/Set in immer
  enableMapSet()

  subscribeNetworkStatus()

  const settingsPromise = apm("initializeSettings", initializeSettings)
  const i18nPromise = apm("i18n", initI18n)
  const analyticsPromise = apm("initAnalytics", initAnalytics)
  const settingSyncPromise = apm("setting sync", () => {
    settingSyncQueue.init()
    settingSyncQueue.syncLocal()
  })

  const snapshotRestoreStartedAt = performance.now()
  void restoreStartupSnapshot()
    .catch((error) => {
      appLog(
        "[startup] snapshot restore failed",
        error instanceof Error ? error.message : String(error),
      )
    })
    .finally(() => {
      appLog(
        "[startup] snapshot restore settled",
        `${Math.trunc(performance.now() - snapshotRestoreStartedAt)}ms`,
      )
      markSnapshotRestoreSettled()
    })

  const hydrateStartedAt = performance.now()
  const hydrateCriticalPromise = apm("hydrateCriticalToStore", () =>
    hydrateCriticalToStore({ migrateDatabase: true }),
  ).then(async () => {
    markHydrateCriticalDone()
    await forceStartupSnapshotRefresh()
    return Math.trunc(performance.now() - hydrateStartedAt)
  })

  const hydrateDeferredPromise = hydrateCriticalPromise.then(async () => {
    const deferredReady = await apm("hydrateDeferredToStore", hydrateDeferredToStore)
    if (deferredReady) {
      markReady()
    }
    return deferredReady
  })

  void Promise.allSettled([
    settingsPromise,
    i18nPromise,
    analyticsPromise,
    settingSyncPromise,
    hydrateCriticalPromise,
    hydrateDeferredPromise,
  ]).then((results) => {
    const hydrateResult = results[4]
    const hydrateDeferredResult = results[5]
    const loadingTime = Math.trunc(performance.now() - startedAt)
    appLog(`Initialize ${APP_NAME} done,`, `${loadingTime}ms`)

    if (hydrateDeferredResult?.status === "rejected") {
      appLog(
        "[startup] deferred hydrate failed",
        hydrateDeferredResult.reason instanceof Error
          ? hydrateDeferredResult.reason.message
          : String(hydrateDeferredResult.reason),
      )
    } else if (
      hydrateDeferredResult?.status === "fulfilled" &&
      hydrateDeferredResult.value === false
    ) {
      appLog("[startup] deferred hydrate failed", "hydrateDeferredToStore returned false")
    }

    tracker.appInit({
      electron: IN_ELECTRON,
      loading_time: loadingTime,
      data_hydrated_time: hydrateResult.status === "fulfilled" ? hydrateResult.value : undefined,
      version: APP_VERSION,
      rn: false,
    })
  })
}

const apm = async (label: string, fn: () => Promise<any> | any) => {
  const start = Date.now()
  const result = await fn()
  const end = Date.now()
  appLog(`${label} took ${end - start}ms`)
  return result
}
