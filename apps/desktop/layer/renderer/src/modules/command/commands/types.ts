// Entry commands

import type { EntryCommand } from "./entry"
import type { GlobalCommand } from "./global"
import type { IntegrationCommand } from "./integration"
import type { LayoutCommand } from "./layout"
import type { SettingsCommand } from "./settings"

export type BasicCommand =
  | EntryCommand
  | SettingsCommand
  | IntegrationCommand
  | GlobalCommand
  | LayoutCommand
