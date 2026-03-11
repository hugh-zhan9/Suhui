import { describe, expect, it } from "vitest"

import { COMMAND_ID } from "../commands/id"
import { defaultCommandShortcuts } from "./use-command-binding"

describe("command shortcuts", () => {
  it("does not expose ai chat command id", () => {
    const removedId = "global:toggle-ai-chat"
    expect(Object.values(COMMAND_ID.global)).not.toContain(removedId)
  })

  it("does not include ai chat in default shortcuts", () => {
    const removedId = "global:toggle-ai-chat"
    expect(Object.keys(defaultCommandShortcuts)).not.toContain(removedId)
  })
})
