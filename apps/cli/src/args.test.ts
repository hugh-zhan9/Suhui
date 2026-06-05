import { describe, expect, it } from "vitest"

import { parseArgs } from "./args.js"
import { CliError, defaultMaxChars, exitCodes } from "./types.js"

describe("parseArgs", () => {
  it("defaults entries list to markdown and the local remote base URL", () => {
    expect(parseArgs(["entries", "list"], {})).toEqual({
      kind: "entries.list",
      baseUrl: "http://127.0.0.1:41595",
      format: "markdown",
      withSummary: false,
    })
  })

  it("parses global options before and after the command", () => {
    expect(
      parseArgs(
        [
          "--base-url",
          "http://localhost:41595/",
          "entries",
          "list",
          "--feed",
          "feed 1",
          "--unread",
          "--limit",
          "5",
          "--cursor",
          "next cursor",
          "--with-summary",
          "--format",
          "json",
        ],
        { SUHUI_CLI_BASE_URL: "http://10.0.0.2:41595" },
      ),
    ).toEqual({
      kind: "entries.list",
      baseUrl: "http://localhost:41595",
      format: "json",
      feedId: "feed 1",
      read: false,
      limit: 5,
      cursor: "next cursor",
      withSummary: true,
    })
  })

  it("uses the environment base URL when no explicit base URL is present", () => {
    expect(parseArgs(["feeds", "list"], { SUHUI_CLI_BASE_URL: "http://10.0.0.2:41595/" })).toEqual({
      kind: "feeds.list",
      baseUrl: "http://10.0.0.2:41595",
      format: "markdown",
    })
  })

  it("parses entries get content options", () => {
    expect(
      parseArgs(["entries", "get", "entry-1", "--content", "summary", "--max-chars", "500"], {}),
    ).toEqual({
      kind: "entries.get",
      baseUrl: "http://127.0.0.1:41595",
      format: "markdown",
      entryId: "entry-1",
      content: "summary",
      maxChars: 500,
    })
  })

  it("defaults entries get content mode and max chars", () => {
    expect(parseArgs(["entries", "get", "entry-1"], {})).toMatchObject({
      kind: "entries.get",
      content: "full",
      maxChars: defaultMaxChars,
    })
  })

  it("parses mark-read and mark-unread entry IDs", () => {
    expect(parseArgs(["entries", "mark-read", "entry-1", "entry-2"], {})).toMatchObject({
      kind: "entries.read",
      entryIds: ["entry-1", "entry-2"],
      read: true,
    })

    expect(parseArgs(["entries", "mark-unread", "entry-1"], {})).toMatchObject({
      kind: "entries.read",
      entryIds: ["entry-1"],
      read: false,
    })
  })

  it("rejects conflicting read filters and invalid enum values as usage errors", () => {
    expect(() => parseArgs(["entries", "list", "--read", "--unread"], {})).toThrow(CliError)
    expect(() => parseArgs(["entries", "get", "entry-1", "--content", "body"], {})).toThrow(
      CliError,
    )
    expect(() => parseArgs(["feeds", "list", "--format", "xml"], {})).toThrow(CliError)
  })

  it("rejects missing option values and missing required arguments as usage errors", () => {
    for (const argv of [
      ["entries", "list", "--limit"],
      ["entries", "get"],
      ["entries", "mark-read"],
      ["--base-url"],
    ]) {
      expect(() => parseArgs(argv, {})).toThrow(
        expect.objectContaining({ exitCode: exitCodes.error }),
      )
    }
  })

  it("rejects stray positional arguments for fixed-shape commands", () => {
    expect(() => parseArgs(["entries", "list", "extra"], {})).toThrow(CliError)
    expect(() => parseArgs(["entries", "get", "entry-1", "extra"], {})).toThrow(CliError)
    expect(() => parseArgs(["feeds", "list", "extra"], {})).toThrow(CliError)
  })
})
