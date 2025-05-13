import { HotkeyScope } from "~/constants/hotkeys"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useCommandBinding } from "~/modules/command/hooks/use-register-hotkey"

import { useHotkeyScope } from "./hotkey-provider"

export const GlobalHotkeysProvider = () => {
  const activeScopes = useHotkeyScope()

  useCommandBinding({
    commandId: COMMAND_ID.global.showShortcuts,
    when:
      activeScopes.includes(HotkeyScope.Home) && !activeScopes.includes(HotkeyScope.EntryRender),
  })

  return null
}
