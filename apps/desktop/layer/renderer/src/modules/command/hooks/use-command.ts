import { jotaiStore } from "@suhui/utils/jotai"
import { useAtomValue } from "jotai"
import { selectAtom } from "jotai/utils"
import { useEffect, useMemo } from "react"

import { isCommandImplementationDeferred, requestCommandImplementation } from "../command-manager"
import { CommandRegistry } from "../registry/registry"
import type { FollowCommandId, FollowCommandMap } from "../types"

export const hasCommand = <T extends FollowCommandId>(id: T) => {
  const commands = jotaiStore.get(CommandRegistry.atom) as FollowCommandMap
  const has = id in commands
  if (!has || isCommandImplementationDeferred(id)) requestCommandImplementation()
  return has
}

export const getCommand = <T extends FollowCommandId>(id: T) => {
  const commands = jotaiStore.get(CommandRegistry.atom) as FollowCommandMap
  if (id in commands) {
    if (isCommandImplementationDeferred(id)) requestCommandImplementation()
    return commands[id]
  }
  requestCommandImplementation()
  return null
}

export const useCommands = () => useAtomValue(CommandRegistry.atom)
export function useCommand<T extends FollowCommandId>(id: T): FollowCommandMap[T] | null {
  const commands = useAtomValue(
    useMemo(() => selectAtom(CommandRegistry.atom, (commands) => commands[id]), [id]),
  )
  useEffect(() => {
    if (!commands || isCommandImplementationDeferred(id)) requestCommandImplementation()
  }, [commands, id])
  return commands as FollowCommandMap[T] | null
}

const noop = () => {}
const runCommand = <T extends FollowCommandId>(
  id: T,
  args: Parameters<FollowCommandMap[T]["run"]>,
) => {
  const cmd = getCommand(id)

  if (!cmd) return noop
  // @ts-expect-error - The type should be discriminated
  return () => cmd.run(...args)
}
export function useRunCommandFn() {
  return runCommand
}
