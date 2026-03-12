import { assertType, test } from "vitest"

import type { IpcServices } from "../../../main/src/ipc"

test("ipc services expose app and sync methods", () => {
  type Services = IpcServices

  assertType<Services["sync"]>({} as Services["sync"])
  assertType<Services["sync"]["recordOp"]>({} as Services["sync"]["recordOp"])

  assertType<Services["app"]["exportEntryAsPDF"]>({} as Services["app"]["exportEntryAsPDF"])
  assertType<Services["app"]["getDbConfig"]>({} as Services["app"]["getDbConfig"])
  assertType<Services["app"]["showFolderDialog"]>({} as Services["app"]["showFolderDialog"])
})
