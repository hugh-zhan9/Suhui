import { resolveBaseUrl } from "./config.js"
import {
  CliError,
  defaultMaxChars,
  defaultOutputFormat,
  exitCodes,
  outputFormats,
  type CliCommand,
  type ContentMode,
  type OutputFormat,
} from "./types.js"

type CliEnv = Record<string, string | undefined>

const usage = "Usage: suhui entries list|get|mark-read|mark-unread or suhui feeds list"

const contentModes = ["full", "summary", "metadata"] as const satisfies readonly ContentMode[]

const usageError = (message: string) => new CliError("SUHUI_USAGE_ERROR", message, exitCodes.error)

const readOption = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  if (index === -1) return undefined

  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw usageError(`Missing value for ${name}`)
  }
  return value
}

const hasFlag = (args: string[], name: string) => args.includes(name)

const parsePositiveIntegerOption = (args: string[], name: string): number | undefined => {
  const value = readOption(args, name)
  if (value === undefined) return undefined

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw usageError(`${name} must be a positive integer`)
  }
  return parsed
}

const parseFormat = (value: string | undefined): OutputFormat => {
  if (value === undefined) return defaultOutputFormat
  if ((outputFormats as readonly string[]).includes(value)) return value as OutputFormat
  throw usageError("--format must be markdown or json")
}

const parseContentMode = (value: string | undefined): ContentMode => {
  if (value === undefined) return "full"
  if ((contentModes as readonly string[]).includes(value)) return value as ContentMode
  throw usageError("--content must be full, summary, or metadata")
}

const removeGlobalOptions = (argv: string[]) => {
  const args: string[] = []
  let explicitBaseUrl: string | undefined
  let formatValue: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!

    if (arg === "--base-url") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--"))
        throw usageError("Missing value for --base-url")
      explicitBaseUrl = value
      index += 1
      continue
    }

    if (arg === "--format") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--"))
        throw usageError("Missing value for --format")
      formatValue = value
      index += 1
      continue
    }

    args.push(arg)
  }

  return {
    args,
    explicitBaseUrl,
    format: parseFormat(formatValue),
  }
}

const assertValidOptions = (
  args: string[],
  valueOptions: ReadonlySet<string>,
  flagOptions: ReadonlySet<string>,
) => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!

    if (valueOptions.has(arg)) {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("--"))
        throw usageError(`Missing value for ${arg}`)
      index += 1
      continue
    }

    if (flagOptions.has(arg)) continue

    if (arg.startsWith("--")) {
      throw usageError(`Unknown option: ${arg}`)
    }
    throw usageError(`Unexpected argument: ${arg}`)
  }
}

const createBaseCommand = (argv: string[], env: CliEnv) => {
  const { args, explicitBaseUrl, format } = removeGlobalOptions(argv)
  try {
    return {
      args,
      baseUrl: resolveBaseUrl({ explicitBaseUrl, env }),
      format,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid base URL"
    throw usageError(message)
  }
}

export const parseArgs = (argv: string[], env: CliEnv = process.env): CliCommand => {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv
  const { args, baseUrl, format } = createBaseCommand(normalizedArgv, env)
  const [group, action, ...rest] = args

  if (group === "entries" && action === "list") {
    assertValidOptions(
      rest,
      new Set(["--feed", "--limit", "--cursor"]),
      new Set(["--read", "--unread", "--with-summary"]),
    )

    const read = hasFlag(rest, "--read")
    const unread = hasFlag(rest, "--unread")
    if (read && unread) throw usageError("--read and --unread cannot be used together")
    const feedId = readOption(rest, "--feed")
    const limit = parsePositiveIntegerOption(rest, "--limit")
    const cursor = readOption(rest, "--cursor")

    return {
      kind: "entries.list",
      baseUrl,
      format,
      ...(read || unread ? { read } : {}),
      ...(feedId === undefined ? {} : { feedId }),
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
      withSummary: hasFlag(rest, "--with-summary"),
    }
  }

  if (group === "entries" && action === "get") {
    const [entryId, ...options] = rest
    if (!entryId || entryId.startsWith("--")) throw usageError("Missing entry ID")

    assertValidOptions(options, new Set(["--content", "--max-chars"]), new Set())

    return {
      kind: "entries.get",
      baseUrl,
      format,
      entryId,
      content: parseContentMode(readOption(options, "--content")),
      maxChars: parsePositiveIntegerOption(options, "--max-chars") ?? defaultMaxChars,
    }
  }

  if (group === "feeds" && action === "list") {
    assertValidOptions(rest, new Set(), new Set())
    return {
      kind: "feeds.list",
      baseUrl,
      format,
    }
  }

  if (group === "entries" && (action === "mark-read" || action === "mark-unread")) {
    if (rest.length === 0) throw usageError("At least one entry ID is required")
    const entryIds = rest.filter((entryId) => entryId.trim() !== "")
    if (entryIds.length !== rest.length || entryIds.some((entryId) => entryId.startsWith("--"))) {
      throw usageError("Entry IDs must be explicit positional arguments")
    }

    return {
      kind: "entries.read",
      baseUrl,
      format,
      entryIds,
      read: action === "mark-read",
    }
  }

  throw usageError(usage)
}
