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

const executeCommand = async (command: CliCommand, fetchImpl: typeof fetch | undefined) => {
  const fetchOptions = { fetchImpl }

  if (command.kind === "entries.list") {
    const data = await fetchAgentJson<AgentEntriesListResult>(
      command.baseUrl,
      buildEntriesListPath(command),
      fetchOptions,
    )
    return formatOutput(command.format, data, () => formatEntriesListMarkdown(data))
  }

  if (command.kind === "entries.get") {
    const data = await fetchAgentJson<AgentEntryDetail>(
      command.baseUrl,
      `/api/agent/entries/${encodeURIComponent(command.entryId)}`,
      fetchOptions,
    )
    return formatOutput(command.format, data, () =>
      formatEntryDetailMarkdown(data, { content: command.content, maxChars: command.maxChars }),
    )
  }

  if (command.kind === "feeds.list") {
    const data = await fetchAgentJson<AgentFeedsListResult>(
      command.baseUrl,
      "/api/agent/feeds",
      fetchOptions,
    )
    return formatOutput(command.format, data, () => formatFeedsMarkdown(data))
  }

  const data = await fetchAgentJson<AgentReadStatusResult>(
    command.baseUrl,
    "/api/agent/entries/read",
    {
      method: "POST",
      body: { entryIds: command.entryIds, read: command.read },
      fetchImpl,
    },
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
