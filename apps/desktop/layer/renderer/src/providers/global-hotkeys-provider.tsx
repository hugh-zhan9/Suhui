import { useHotkeysContext } from "react-hotkeys-hook"

import { HotKeyScopeMap } from "~/constants/hotkeys"
import { shortcuts } from "~/constants/shortcuts"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useCommandHotkey } from "~/modules/command/hooks/use-register-hotkey"

export const GlobalHotkeysProvider = () => {
  const { activeScopes } = useHotkeysContext()

  useCommandHotkey({
    commandId: COMMAND_ID.global.showShortcuts,
    shortcut: shortcuts.layout.showShortcuts.key,
    when: activeScopes.includes(HotKeyScopeMap.Home),
  })

  return null
}
