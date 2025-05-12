import { useRegisterEntryCommands } from "./commands/entry"
import { useRegisterGlobalCommands } from "./commands/global"
import { useRegisterIntegrationCommands } from "./commands/integration"
import { useRegisterLayoutCommands } from "./commands/layout"
import { useRegisterListCommands } from "./commands/list"
import { useRegisterSettingsCommands } from "./commands/settings"

export const FollowCommandManager = () => {
  useRegisterSettingsCommands()
  useRegisterListCommands()
  useRegisterEntryCommands()
  useRegisterIntegrationCommands()
  useRegisterGlobalCommands()
  useRegisterLayoutCommands()
  return null
}
