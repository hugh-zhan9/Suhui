import type { InboxSchema } from "@suhui/database/schemas/types"
import { InboxService } from "@suhui/database/services/inbox"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import type { InboxModel } from "./types"

interface InboxState {
  inboxes: Record<string, InboxModel>
}

const defaultState = {
  inboxes: {},
}

export const useInboxStore = createZustandStore<InboxState>("inbox")(() => defaultState)

const get = useInboxStore.getState
const set = useInboxStore.setState
const immerSet = createImmerSetter(useInboxStore)

class InboxActions implements Hydratable, Resetable {
  async hydrate() {
    const inboxes = await InboxService.getInboxAll()
    inboxActions.upsertManyInSession(inboxes)
  }
  async upsertManyInSession(inboxes: InboxSchema[]) {
    const state = useInboxStore.getState()
    const nextInboxes: InboxState["inboxes"] = {
      ...state.inboxes,
    }
    inboxes.forEach((inbox) => {
      nextInboxes[inbox.id] = {
        type: "inbox",
        ...inbox,
      }
    })
    set({
      ...state,
      inboxes: nextInboxes,
    })
  }
  async upsertMany(inboxes: InboxSchema[]) {
    const tx = createTransaction()
    tx.store(() => {
      this.upsertManyInSession(inboxes)
    })
    tx.persist(() => {
      return InboxService.upsertMany(inboxes)
    })
    tx.run()
  }

  deleteById(id: string) {
    immerSet((state) => {
      delete state.inboxes[id]
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })

    tx.persist(() => {
      return InboxService.purgeAllForMaintenance()
    })

    await tx.run()
  }
}

class InboxSyncService {
  /**
   * 收件箱的邮件地址由云端服务分配，本地无法新建，UI 也已没有入口
   * （InboxForm 只会以既有 inboxId 打开），因此这里只保留改名。
   */
  async updateInbox({ handle, title }: { handle: string; title: string }) {
    const existingInbox = get().inboxes[handle]
    if (!existingInbox) return

    const newInbox = {
      ...existingInbox,
      title,
    }
    const tx = createTransaction()
    tx.store(async () => {
      await inboxActions.upsertManyInSession([newInbox])
    })
    tx.persist(() => InboxService.upsertMany([newInbox]))
    tx.rollback(() => inboxActions.upsertMany([existingInbox]))
    await tx.run()
  }
}

export const inboxActions = new InboxActions()
export const inboxSyncService = new InboxSyncService()
