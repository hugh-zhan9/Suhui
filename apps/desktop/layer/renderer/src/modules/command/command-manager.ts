import type { ComponentType } from "react"
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { COMMAND_ID } from "./commands/id"
import { CommandRegistry, registerDeferredCommand } from "./registry/registry"
import type { Command, CommandCategory } from "./types"

export type CommandImplementation = ComponentType<{ onReady: () => void }>
type CommandResolver = (id: string) => Command | undefined

const commandIds = Object.entries(COMMAND_ID).flatMap(([groupName, group]) =>
  groupName === "integration" ? [] : Object.values(group),
)

let commandLookupCanLoad = false
let requestImplementation: (() => Promise<void>) | null = null
const deferredCommandIds = new Set<string>()

export const isCommandImplementationDeferred = (id: string) => deferredCommandIds.has(id)

export const requestCommandImplementation = () => {
  if (!commandLookupCanLoad || !requestImplementation) return
  void requestImplementation().catch((error) => {
    console.error("Failed to load command implementation. Invoke a command to retry.", error)
  })
}

const categoryForCommand = (id: string) => {
  const prefix = id.split(":", 1)[0]
  if (prefix === "follow") return "category.settings"
  if (prefix === "entry-render") return "category.entry_render"
  return `category.${prefix}` as CommandCategory
}

export const createDeferredCommandRunner = ({
  load,
  resolve,
}: {
  load: () => Promise<void>
  resolve: CommandResolver
}) => {
  let loadPromise: Promise<void> | null = null

  return async (id: string, args: unknown[]) => {
    loadPromise ??= load().catch((error) => {
      loadPromise = null
      throw error
    })
    await loadPromise

    const command = resolve(id)
    if (!command) {
      throw new Error(`Command ${id} was not registered after its implementation loaded.`)
    }
    return command.run(...args)
  }
}

const loadCommandImplementation = async (): Promise<CommandImplementation> => {
  const [entry, entryRender, global, integration, layout, list, settings, subscription, timeline] =
    await Promise.all([
      import("./commands/entry"),
      import("./commands/entry-render"),
      import("./commands/global"),
      import("./commands/integration"),
      import("./commands/layout"),
      import("./commands/list"),
      import("./commands/settings"),
      import("./commands/subscription"),
      import("./commands/timeline"),
    ])

  return function LoadedCommandManager({ onReady }) {
    settings.useRegisterSettingsCommands()
    list.useRegisterListCommands()
    entry.useRegisterEntryCommands()
    integration.useRegisterIntegrationCommands()
    global.useRegisterGlobalCommands()
    layout.useRegisterLayoutCommands()
    timeline.useRegisterTimelineCommand()
    entryRender.useRegisterEntryRenderCommand()
    subscription.useRegisterSubscriptionCommands()

    useEffect(onReady, [onReady])
    return null
  }
}

export const createFollowCommandManager = ({
  implementationLoader = loadCommandImplementation,
  ids = commandIds,
}: {
  implementationLoader?: () => Promise<CommandImplementation>
  ids?: string[]
} = {}) =>
  function FollowCommandManager() {
    const [Implementation, setImplementation] = useState<CommandImplementation | null>(null)
    const placeholderUnsubscribesRef = useRef<Array<() => void>>([])
    const readyResolversRef = useRef<Array<() => void>>([])
    const mountedRef = useRef(true)

    useEffect(() => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        readyResolversRef.current.splice(0).forEach((resolve) => resolve())
      }
    }, [])

    const onReady = useCallback(() => {
      placeholderUnsubscribesRef.current.splice(0).forEach((unsubscribe) => unsubscribe())
      deferredCommandIds.clear()
      readyResolversRef.current.splice(0).forEach((resolve) => resolve())
    }, [])

    const load = useMemo(
      () => async () => {
        const implementation = await implementationLoader()
        if (!mountedRef.current) {
          throw new Error("Command manager unmounted while loading its implementation.")
        }

        await new Promise<void>((resolve) => {
          readyResolversRef.current.push(resolve)
          setImplementation(() => implementation)
        })
      },
      [implementationLoader],
    )

    const ensureLoaded = useMemo(() => {
      let promise: Promise<void> | null = null
      return () => {
        promise ??= load().catch((error) => {
          promise = null
          throw error
        })
        return promise
      }
    }, [load])

    const runDeferred = useMemo(
      () =>
        createDeferredCommandRunner({
          load: ensureLoaded,
          resolve: (id) => CommandRegistry.get(id),
        }),
      [ensureLoaded],
    )

    useEffect(() => {
      placeholderUnsubscribesRef.current = ids.map((id) =>
        registerDeferredCommand({
          id,
          label: id,
          category: categoryForCommand(id),
          run: (...args: unknown[]) => {
            void runDeferred(id, args).catch((error) => {
              console.error(`Failed to load command ${id}. Invoke it again to retry.`, error)
            })
          },
        }),
      )
      ids.forEach((id) => deferredCommandIds.add(id))
      commandLookupCanLoad = true
      requestImplementation = ensureLoaded

      return () => {
        commandLookupCanLoad = false
        requestImplementation = null
        deferredCommandIds.clear()
        placeholderUnsubscribesRef.current.splice(0).forEach((unsubscribe) => unsubscribe())
      }
    }, [ensureLoaded, ids, runDeferred])

    return Implementation ? createElement(Implementation, { onReady }) : null
  }

export const FollowCommandManager = createFollowCommandManager()
