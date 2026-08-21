import type { AuthUser } from "@follow-app/client-sdk"
import { UserRole } from "@suhui/constants"
import type { UserSchema } from "@suhui/database/schemas/types"
import { UserService } from "@suhui/database/services/user"

import { authClient } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { apiMorph } from "../../morph/api"
import type { UserProfileEditable } from "./types"

export type UserModel = UserSchema

export type MeModel = AuthUser & {
  emailVerified?: boolean
  twoFactorEnabled?: boolean | null
}
export type UserStore = {
  users: Record<string, UserModel>
  whoami: MeModel | null
  role: UserRole | null
  roleEndAt: Date | null
  rsshubSubscriptionLimit?: number | null
  feedSubscriptionLimit?: number | null
}

export const LOCAL_USER_ID = "local_user_id"

export const buildLocalWhoamiUser = (persisted?: Partial<AuthUser>): AuthUser =>
  ({
    id: LOCAL_USER_ID,
    name: persisted?.name || "Local User",
    email: persisted?.email || "",
    emailVerified: true,
    image: persisted?.image || "",
    createdAt: persisted?.createdAt || (new Date().toISOString() as any),
    updatedAt: new Date().toISOString() as any,
    role: UserRole.Pro,
    roleEndAt: null,
  }) as unknown as AuthUser

const defaultState: UserStore = {
  users: {},
  whoami: null,
  role: null,
  roleEndAt: null,
}

export const useUserStore = createZustandStore<UserStore>("user")(() => defaultState)

const get = useUserStore.getState
const set = useUserStore.setState
const immerSet = createImmerSetter(useUserStore)

class UserSyncService {
  /**
   * Reads the saved local profile straight from the database. `whoami()` can run
   * before critical hydration finishes, so the session store is not a reliable
   * source — and the result is upserted below, which would otherwise write the
   * fallback name back over whatever the user saved.
   */
  private async readPersistedLocalUser(): Promise<Partial<AuthUser> | undefined> {
    const users = await UserService.getUserAll()
    const local = users.find((user) => user.id === LOCAL_USER_ID)
    return (local as unknown as Partial<AuthUser> | undefined) || undefined
  }

  async whoami() {
    const inSession =
      (get().users[LOCAL_USER_ID] as unknown as Partial<AuthUser> | undefined) ||
      (get().whoami as Partial<AuthUser> | null) ||
      undefined
    const persisted = inSession || (await this.readPersistedLocalUser())
    const defaultUser = buildLocalWhoamiUser(persisted)

    const res = {
      session: {
        id: "local_session_id",
        userId: LOCAL_USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      },
      user: defaultUser,
      rsshubSubscriptionLimit: 9999,
      feedSubscriptionLimit: 9999,
    }

    const user = apiMorph.toWhoami(res.user)
    immerSet((state) => {
      state.whoami = { ...user, emailVerified: res.user?.emailVerified ?? false }
      state.role = res.user?.role as UserRole | null
      state.roleEndAt = null
      state.rsshubSubscriptionLimit = res.rsshubSubscriptionLimit ?? null
      state.feedSubscriptionLimit = res.feedSubscriptionLimit ?? null
    })
    userActions.upsertMany([user])

    return res as any
  }

  async updateProfile(data: Partial<UserProfileEditable>) {
    const me = get().whoami
    if (!me) return
    const tx = createTransaction(me)

    tx.store(() => {
      immerSet((state) => {
        if (!state.whoami) return
        state.whoami = { ...state.whoami, ...data } as MeModel
      })
    })

    tx.request(async () => {
      // FreeFolo 本地模式：资料更新不再请求远端接口
    })
    tx.persist(async () => {
      const { whoami } = get()
      if (!whoami) return
      const nextUser = {
        ...whoami,
        ...data,
      }
      await userActions.upsertMany([nextUser])
    })
    tx.rollback(() => {
      immerSet((state) => {
        if (!state.whoami) return
        state.whoami = me
      })
    })
    await tx.run()
  }

  async sendVerificationEmail() {
    const me = get().whoami
    if (!me?.email) return
    await authClient().sendVerificationEmail({ email: me.email! })
  }

  async updateTwoFactor(enabled: boolean, password: string) {
    const me = get().whoami

    if (!me) throw new Error("user not login")

    const res = enabled
      ? await authClient().twoFactor.enable({ password })
      : await authClient().twoFactor.disable({ password })

    if (!res.error) {
      immerSet((state) => {
        if (!state.whoami) return

        // If set enable 2FA, we can't check the 2FA status immediately, must to bind the 2FA app and verify code first
        if (!enabled) state.whoami.twoFactorEnabled = false
      })
    }

    return res
  }

  async updateEmail(email: string) {
    const oldEmail = get().whoami?.email
    if (!oldEmail) return
    const tx = createTransaction(oldEmail)
    tx.store(() => {
      immerSet((state) => {
        if (!state.whoami) return
        state.whoami = { ...state.whoami, email }
      })
    })
    tx.request(async () => {
      const { whoami } = get()
      if (!whoami) return
      await authClient().changeEmail({ newEmail: email })
    })
    tx.rollback(() => {
      immerSet((state) => {
        if (!state.whoami) return
        state.whoami.email = oldEmail
      })
    })
    tx.persist(async () => {
      const { whoami } = get()
      if (!whoami) return
      userActions.upsertMany([{ ...whoami, email }])
    })
    await tx.run()
  }

  /**
   * Reads a profile from the locally hydrated store. There is no remote profile
   * service, and locally the only user is `LOCAL_USER_ID`.
   */
  async fetchUser(userId: string | undefined) {
    if (!userId) return null
    return get().users[userId] || null
  }
}

class UserActions implements Hydratable, Resetable {
  async hydrate() {
    const users = await UserService.getUserAll()
    userActions.upsertManyInSession(users)
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => UserService.purgeAllForMaintenance())
    await tx.run()
  }

  upsertManyInSession(users: UserModel[]) {
    immerSet((state) => {
      for (const user of users) {
        state.users[user.id] = user
        if (user.isMe) {
          state.whoami = { ...user, emailVerified: user.emailVerified ?? false } as MeModel
        }
      }
    })
  }

  updateWhoami(data: Partial<MeModel>) {
    immerSet((state) => {
      if (!state.whoami) return
      state.whoami = { ...state.whoami, ...data }
    })
  }

  async upsertMany(users: UserModel[]) {
    const tx = createTransaction()
    tx.store(() => this.upsertManyInSession(users))
    const { whoami } = useUserStore.getState()
    tx.persist(() =>
      UserService.upsertMany(users.map((user) => ({ ...user, isMe: whoami?.id === user.id }))),
    )
    await tx.run()
  }

  async removeCurrentUser() {
    const tx = createTransaction()
    tx.store(() => {
      immerSet((state) => {
        state.whoami = null
        state.role = null
        state.roleEndAt = null
      })
    })
    tx.persist(() => UserService.removeCurrentUser())
    await tx.run()
  }
}

export const userSyncService = new UserSyncService()
export const userActions = new UserActions()
