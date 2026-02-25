import type { AISettings, GeneralSettings, UISettings } from "@follow/shared/settings/interface"
import { EventBus } from "@follow/utils/event-bus"
import { getStorageNS } from "@follow/utils/ns"
import { isEmptyObject, sleep } from "@follow/utils/utils"
import type { SettingsTab } from "@follow-app/client-sdk"
import { omit } from "es-toolkit/compat"
import type { PrimitiveAtom } from "jotai"

import { __aiSettingAtom, aiServerSyncWhiteListKeys, getAISettings } from "~/atoms/settings/ai"
import {
  __generalSettingAtom,
  generalServerSyncWhiteListKeys,
  getGeneralSettings,
} from "~/atoms/settings/general"
import { __uiSettingAtom, getUISettings, uiServerSyncWhiteListKeys } from "~/atoms/settings/ui"
import { followClient } from "~/lib/api-client"
import { jotaiStore } from "~/lib/jotai"
import { settings } from "~/queries/settings"

type SettingMapping = {
  appearance: UISettings
  general: GeneralSettings
  ai: AISettings
}

const omitKeys = []

const localSettingGetterMap = {
  appearance: () => omit(getUISettings(), uiServerSyncWhiteListKeys, omitKeys),
  general: () => omit(getGeneralSettings(), generalServerSyncWhiteListKeys, omitKeys),
  ai: () => omit(getAISettings(), aiServerSyncWhiteListKeys, omitKeys),
}

const createInternalSetter =
  <T>(atom: PrimitiveAtom<T>) =>
  (payload: T) => {
    const current = jotaiStore.get(atom)
    jotaiStore.set(atom, { ...current, ...payload })
  }

const localSettingSetterMap = {
  appearance: createInternalSetter(__uiSettingAtom),
  general: createInternalSetter(__generalSettingAtom),
  ai: createInternalSetter(__aiSettingAtom),
}

const settingWhiteListMap = {
  appearance: uiServerSyncWhiteListKeys,
  general: generalServerSyncWhiteListKeys,
  ai: aiServerSyncWhiteListKeys,
}

const bizSettingKeyToTabMapping = {
  ui: "appearance",
  general: "general",
  ai: "ai",
}

export type SettingSyncTab = keyof SettingMapping
export interface SettingSyncQueueItem<T extends SettingSyncTab = SettingSyncTab> {
  tab: T
  payload: Partial<SettingMapping[T]>
  date: number
}
class SettingSyncQueue {
  queue: SettingSyncQueueItem[] = []

  private disposers: (() => void)[] = []
  async init() {
    this.teardown()

    this.load()

    const d1 = EventBus.subscribe("SETTING_CHANGE_EVENT", (data) => {
      const tab = bizSettingKeyToTabMapping[data.key]
      if (!tab) return

      const nextPayload = omit(data.payload, omitKeys, settingWhiteListMap[tab])
      if (isEmptyObject(nextPayload)) return
      this.enqueue(tab, nextPayload)
    })
    const onlineHandler = () => (this.chain = this.chain.finally(() => this.flush()))

    window.addEventListener("online", onlineHandler)
    const d2 = () => window.removeEventListener("online", onlineHandler)

    const unloadHandler = () => this.persist()

    window.addEventListener("beforeunload", unloadHandler)
    const d3 = () => window.removeEventListener("beforeunload", unloadHandler)

    this.disposers.push(d1, d2, d3)
  }

  teardown() {
    for (const disposer of this.disposers) {
      disposer()
    }
    this.queue = []
  }

  private readonly storageKey = getStorageNS("setting_sync_queue")
  private persist() {
    if (this.queue.length === 0) {
      return
    }
    localStorage.setItem(this.storageKey, JSON.stringify(this.queue))
  }

  private load() {
    const queue = localStorage.getItem(this.storageKey)
    localStorage.removeItem(this.storageKey)
    if (!queue) {
      return
    }

    try {
      this.queue = JSON.parse(queue)
    } catch {
      /* empty */
    }
  }

  private chain = Promise.resolve()

  private threshold = 1000
  private enqueueTime = Date.now()

  async enqueue<T extends SettingSyncTab>(tab: T, payload: Partial<SettingMapping[T]>) {
    const now = Date.now()
    if (isEmptyObject(payload)) {
      return
    }
    this.queue.push({
      tab,
      payload,
      date: now,
    })

    if (now - this.enqueueTime > this.threshold) {
      this.chain = this.chain.then(() => sleep(this.threshold)).finally(() => this.flush())
      this.enqueueTime = Date.now()
    }
  }

  private async flush() {
    // [Local Mode] No remote settings sync needed
    // Clear the queue since settings are stored locally only
    this.queue = []
  }

  replaceRemote(_tab?: SettingSyncTab) {
    // [Local Mode] No remote settings sync needed
    return Promise.resolve()
  }

  async syncLocal() {
    // [Local Mode] No remote settings to sync from
    // Settings are stored locally only
  }
}

export const settingSyncQueue = new SettingSyncQueue()
