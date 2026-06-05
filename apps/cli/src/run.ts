import { parseArgs } from "./args.js"
import {
  formatEntriesListMarkdown,
  formatEntryDetailMarkdown,
  formatError,
  formatFeedsMarkdown,
  formatJson,
  formatReadStatusMarkdown,
} from "./format.js"
import { fetchAgentJson } from "./http.js"
import {
  CliError,
  exitCodes,
  type AgentEntriesListResult,
  type AgentEntryDetail,
  type AgentFeedsListResult,
  type AgentReadStatusResult,
  type CliCommand,
  type ExitCode,
  type OutputFormat,
} from "./types.js"

type CliEnv = Record<string, string | undefined>

export type RunCliInput = {
  argv: string[]
  env?: CliEnv | undefined
  fetch?: typeof fetch | undefined
}

export type RunCliResult = {
  exitCode: ExitCode
  stdout: string
  stderr: string
}

const appendSearchParam = (params: URLSearchParams, name: string, value: unknown) => {
  if (value !== undefined) params.set(name, String(value))
}

const buildEntriesListPath = (command: Extract<CliCommand, { kind: "entries.list" }>) => {
  const params = new URLSearchParams()
  appendSearchParam(params, "feedId", command.feedId)
  appendSearchParam(params, "read", command.read)
  appendSearchParam(params, "limit", command.limit)
  appendSearchParam(params, "cursor", command.cursor)
  if (command.withSummary) params.set("withSummary", "true")

  const query = params.toString()
  return `/api/agent/entries${query ? `?${query}` : ""}`
}

const formatOutput = (format: OutputFormat, value: unknown, markdown: () => string) =>
  format === "json" ? formatJson(value) : markdown()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isNullableString = (value: unknown) => typeof value === "string" || value === null

const isFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value)

const unexpectedResponse = () =>
  new CliError(
    "SUHUI_UNEXPECTED_RESPONSE",
    "Suhui remote API returned an unexpected response shape",
    exitCodes.unexpectedResponse,
  )

const assertUnexpectedResponse = <T>(
  value: unknown,
  isValid: (value: unknown) => value is T,
): T => {
  if (!isValid(value)) throw unexpectedResponse()
  return value
}

const hasEntryListItemFields = (value: Record<string, unknown>) =>
  typeof value.id === "string" &&
  isNullableString(value.feedId) &&
  typeof value.feedTitle === "string" &&
  typeof value.title === "string" &&
  isNullableString(value.url) &&
  isNullableString(value.author) &&
  (isFiniteNumber(value.publishedAt) || value.publishedAt === null) &&
  isNullableString(value.publishedAtIso) &&
  (isFiniteNumber(value.insertedAt) || value.insertedAt === null) &&
  isNullableString(value.insertedAtIso) &&
  typeof value.read === "boolean" &&
  (value.summary === undefined || isNullableString(value.summary))

const isEntryListItem = (value: unknown): value is AgentEntriesListResult["items"][number] =>
  isRecord(value) && hasEntryListItemFields(value)

const isEntriesListResult = (value: unknown): value is AgentEntriesListResult =>
  isRecord(value) &&
  Array.isArray(value.items) &&
  value.items.every(isEntryListItem) &&
  isRecord(value.page) &&
  isFiniteNumber(value.page.limit) &&
  isNullableString(value.page.nextCursor) &&
  typeof value.page.hasMore === "boolean"

const isEntryContentSource = (value: unknown): value is AgentEntryDetail["contentSource"] =>
  value === "readabilityContent" ||
  value === "content" ||
  value === "description" ||
  value === "none"

const isEntryDetail = (value: unknown): value is AgentEntryDetail => {
  if (!isRecord(value)) return false

  return (
    hasEntryListItemFields(value) &&
    typeof value.content === "string" &&
    isEntryContentSource(value.contentSource) &&
    isNullableString(value.description)
  )
}

const isFeedListItem = (value: unknown): value is AgentFeedsListResult["items"][number] =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.subscriptionId === "string" &&
  typeof value.title === "string" &&
  isNullableString(value.url) &&
  isNullableString(value.siteUrl) &&
  isNullableString(value.category) &&
  isFiniteNumber(value.unreadCount)

const isFeedsListResult = (value: unknown): value is AgentFeedsListResult =>
  isRecord(value) && Array.isArray(value.items) && value.items.every(isFeedListItem)

const isReadStatusResult = (value: unknown): value is AgentReadStatusResult =>
  isRecord(value) && isFiniteNumber(value.updated) && typeof value.read === "boolean"

const executeCommand = async (command: CliCommand, fetchImpl: typeof fetch | undefined) => {
  const fetchOptions = { fetchImpl }

  if (command.kind === "entries.list") {
    const data = assertUnexpectedResponse(
      await fetchAgentJson<AgentEntriesListResult>(
        command.baseUrl,
        buildEntriesListPath(command),
        fetchOptions,
      ),
      isEntriesListResult,
    )
    return formatOutput(command.format, data, () => formatEntriesListMarkdown(data))
  }

  if (command.kind === "entries.get") {
    const data = assertUnexpectedResponse(
      await fetchAgentJson<AgentEntryDetail>(
        command.baseUrl,
        `/api/agent/entries/${encodeURIComponent(command.entryId)}`,
        fetchOptions,
      ),
      isEntryDetail,
    )
    return formatOutput(command.format, data, () =>
      formatEntryDetailMarkdown(data, { content: command.content, maxChars: command.maxChars }),
    )
  }

  if (command.kind === "feeds.list") {
    const data = assertUnexpectedResponse(
      await fetchAgentJson<AgentFeedsListResult>(command.baseUrl, "/api/agent/feeds", fetchOptions),
      isFeedsListResult,
    )
    return formatOutput(command.format, data, () => formatFeedsMarkdown(data))
  }

  const data = assertUnexpectedResponse(
    await fetchAgentJson<AgentReadStatusResult>(command.baseUrl, "/api/agent/entries/read", {
      method: "POST",
      body: { entryIds: command.entryIds, read: command.read },
      fetchImpl,
    }),
    isReadStatusResult,
  )
  return formatOutput(command.format, data, () => formatReadStatusMarkdown(data))
}

const fallbackFormat = (argv: string[]): OutputFormat => {
  const formatIndex = argv.indexOf("--format")
  const value = formatIndex === -1 ? undefined : argv[formatIndex + 1]
  return value === "json" ? "json" : "markdown"
}

const errorToCliError = (error: unknown): CliError => {
  if (error instanceof CliError) return error

  const message = error instanceof Error ? error.message : "Unexpected CLI error"
  return new CliError("SUHUI_EXECUTION_ERROR", message, exitCodes.error)
}

export const runCli = async ({
  argv,
  env = process.env,
  fetch: fetchImpl,
}: RunCliInput): Promise<RunCliResult> => {
  try {
    const command = parseArgs(argv, env)
    const stdout = await executeCommand(command, fetchImpl)
    return { exitCode: exitCodes.success, stdout, stderr: "" }
  } catch (error) {
    const cliError = errorToCliError(error)
    return {
      exitCode: cliError.exitCode,
      stdout: "",
      stderr: formatError(cliError, fallbackFormat(argv)),
    }
  }
}
