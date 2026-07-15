#!/usr/bin/env tsx

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"

import { desc, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { dirname, resolve } from "pathe"
import pg from "pg"

import {
  entriesTable,
  subscriptionsTable,
} from "../../../../packages/internal/database/src/schemas/postgres.ts"
import * as schema from "../../../../packages/internal/database/src/schemas/postgres.ts"
import type { ActiveVisibilityState } from "../../../../packages/internal/database/src/services/internal/active-visibility.ts"
import type { EntryQuerySubscription } from "../../layer/main/src/application/entry/query-builder.ts"
import {
  buildEntryListQueryConfig,
  entrySummaryColumns,
} from "../../layer/main/src/application/entry/query-builder.ts"
import type { EntryCursor } from "../../layer/main/src/application/entry/query-cursor.ts"
import type { FixtureScale } from "./contracts.ts"
import {
  buildFixtureManifest,
  buildFixtureSubscription,
  FIXTURE_SEED,
  readHarnessTarget,
} from "./fixture.ts"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const queryBuilderSource = resolve(appRoot, "layer/main/src/application/entry/query-builder.ts")
const cursorSource = resolve(appRoot, "layer/main/src/application/entry/query-cursor.ts")
const queryServiceSource = resolve(appRoot, "layer/main/src/application/entry/query-service.ts")

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")

export const hashApplicationQuerySources = (input: {
  builder: string | Buffer
  cursor: string | Buffer
  service: string | Buffer
}) =>
  sha256(
    Buffer.concat([
      Buffer.from(input.builder),
      Buffer.from("\0"),
      Buffer.from(input.cursor),
      Buffer.from("\0"),
      Buffer.from(input.service),
    ]),
  )

export type SanitizedExplainPlan = {
  planningMs: number
  executionMs: number
  actualRows: number
  actualTotalMs: number
  sharedHitBlocks: number
  sharedReadBlocks: number
  tempReadBlocks: number
  tempWrittenBlocks: number
  rowsRemovedByFilter: number
  nodeTypes: string[]
}

export type QueryPlanStatement = {
  id: "timeline" | "unread_timeline" | "multi_feed" | "stable_keyset"
  statement: string
  statementSha256: string
  projection: string[]
  boundedRows: 21
  plan: SanitizedExplainPlan
}

export type QueryPlanArtifact = {
  schema: "suhui.performance-query-plan.v1"
  fixture: FixtureScale
  seed: typeof FIXTURE_SEED
  status: "ready" | "unverified"
  provenance: {
    sourceSha256: string
    collectorSha256: string
  }
  statements: QueryPlanStatement[]
  evidenceGaps: string[]
}

type ArtifactStatementInput = Omit<QueryPlanStatement, "statementSha256">

export const representativeStatementIds = [
  "timeline",
  "unread_timeline",
  "multi_feed",
  "stable_keyset",
] as const

export const applicationSummaryProjection = Object.entries(entrySummaryColumns)
  .filter(([, included]) => included)
  .map(([key]) => {
    const column = (entriesTable as unknown as Record<string, { name?: string }>)[key]?.name
    if (!column) throw new Error(`summary projection column is missing: ${key}`)
    return column
  })

const allowedPlanNodeTypes = new Set([
  "Aggregate",
  "Append",
  "Bitmap Heap Scan",
  "Bitmap Index Scan",
  "Gather",
  "Gather Merge",
  "Hash",
  "Hash Join",
  "Index Only Scan",
  "Index Scan",
  "Limit",
  "Materialize",
  "Memoize",
  "Merge Join",
  "Nested Loop",
  "Result",
  "Seq Scan",
  "Sort",
])

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) => {
  const allowed = new Set([...required, ...optional])
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  const missing = required.filter((key) => !(key in value))
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      `closed query-plan schema mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`,
    )
  }
}

export function assertReadOnlyStatement(statement: string): void {
  const withoutComments = statement
    .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
    .replaceAll(/--[^\r\n]*/g, " ")
    .trim()
  if (
    !/^select\b/i.test(withoutComments) ||
    /;\s*\S/.test(withoutComments) ||
    /\b(?:insert|update|delete|merge|create|alter|drop|truncate|copy|call|do|grant|revoke|vacuum|reindex|cluster)\b/i.test(
      withoutComments,
    )
  ) {
    throw new Error("EXPLAIN collector accepts one read-only SELECT statement")
  }
}

const nonnegativeMetric = (value: unknown, name: string) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`EXPLAIN metric is missing or invalid: ${name}`)
  }
  return value
}

export function sanitizeExplainPlan(raw: unknown): SanitizedExplainPlan {
  const envelope = Array.isArray(raw) ? raw[0] : undefined
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("EXPLAIN did not return a JSON plan envelope")
  }
  const record = envelope as Record<string, unknown>
  const root = record.Plan
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("EXPLAIN plan root is missing")
  }

  const nodeTypes: string[] = []
  let rowsRemovedByFilter = 0
  let filterMetricCount = 0
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("EXPLAIN contains an invalid plan node")
    }
    const value = node as Record<string, unknown>
    const nodeType = value["Node Type"]
    if (typeof nodeType !== "string" || !allowedPlanNodeTypes.has(nodeType)) {
      throw new Error("EXPLAIN contains an unknown plan node type")
    }
    if (!nodeTypes.includes(nodeType)) {
      nodeTypes.push(nodeType)
    }
    if ("Rows Removed by Filter" in value) {
      rowsRemovedByFilter += nonnegativeMetric(
        value["Rows Removed by Filter"],
        "Rows Removed by Filter",
      )
      filterMetricCount += 1
    }
    if (Array.isArray(value.Plans)) value.Plans.forEach(visit)
  }
  visit(root)
  if (filterMetricCount === 0) throw new Error("EXPLAIN filter count is missing")
  const rootRecord = root as Record<string, unknown>
  return {
    planningMs: nonnegativeMetric(record["Planning Time"], "Planning Time"),
    executionMs: nonnegativeMetric(record["Execution Time"], "Execution Time"),
    actualRows: nonnegativeMetric(rootRecord["Actual Rows"], "Actual Rows"),
    actualTotalMs: nonnegativeMetric(rootRecord["Actual Total Time"], "Actual Total Time"),
    sharedHitBlocks: nonnegativeMetric(rootRecord["Shared Hit Blocks"], "Shared Hit Blocks"),
    sharedReadBlocks: nonnegativeMetric(rootRecord["Shared Read Blocks"], "Shared Read Blocks"),
    tempReadBlocks: nonnegativeMetric(rootRecord["Temp Read Blocks"], "Temp Read Blocks"),
    tempWrittenBlocks: nonnegativeMetric(rootRecord["Temp Written Blocks"], "Temp Written Blocks"),
    rowsRemovedByFilter,
    nodeTypes,
  }
}

export function buildQueryPlanArtifact(input: {
  fixture: FixtureScale
  sourceSha256: string
  collectorSha256: string
  statements: readonly ArtifactStatementInput[]
  evidenceGap?: string
}): QueryPlanArtifact {
  const evidenceGaps = input.evidenceGap ? [input.evidenceGap] : []
  const artifact: QueryPlanArtifact = {
    schema: "suhui.performance-query-plan.v1",
    fixture: input.fixture,
    seed: FIXTURE_SEED,
    status: evidenceGaps.length > 0 || input.statements.length !== 4 ? "unverified" : "ready",
    provenance: {
      sourceSha256: input.sourceSha256,
      collectorSha256: input.collectorSha256,
    },
    statements: input.statements.map((statement) => {
      assertReadOnlyStatement(statement.statement)
      return {
        ...statement,
        statement: statement.statement.replaceAll(/\s+/g, " ").trim(),
        statementSha256: sha256(statement.statement.replaceAll(/\s+/g, " ").trim()),
      }
    }),
    evidenceGaps,
  }
  assertQueryPlanArtifact(artifact)
  return artifact
}

export function assertQueryPlanArtifact(value: unknown): asserts value is QueryPlanArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("query-plan artifact must be an object")
  }
  const record = value as Record<string, unknown>
  exactKeys(record, [
    "schema",
    "fixture",
    "seed",
    "status",
    "provenance",
    "statements",
    "evidenceGaps",
  ])
  const artifact = record as Partial<QueryPlanArtifact>
  if (
    artifact.schema !== "suhui.performance-query-plan.v1" ||
    !["normal", "stress"].includes(artifact.fixture ?? "") ||
    artifact.seed !== FIXTURE_SEED ||
    !["ready", "unverified"].includes(artifact.status ?? "") ||
    !artifact.provenance ||
    !/^[a-f0-9]{64}$/.test(artifact.provenance.sourceSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(artifact.provenance.collectorSha256 ?? "") ||
    !Array.isArray(artifact.statements) ||
    !Array.isArray(artifact.evidenceGaps)
  ) {
    throw new Error("invalid query-plan artifact envelope")
  }
  exactKeys(artifact.provenance as unknown as Record<string, unknown>, [
    "sourceSha256",
    "collectorSha256",
  ])
  if (
    artifact.evidenceGaps.some((gap) => typeof gap !== "string" || gap.trim().length === 0) ||
    (artifact.status === "unverified" && artifact.evidenceGaps.length === 0)
  ) {
    throw new Error("unverified query-plan artifact must contain explicit evidence gaps")
  }
  if (
    artifact.status === "ready" &&
    (artifact.statements.length !== 4 || artifact.evidenceGaps.length > 0)
  ) {
    throw new Error("ready query-plan artifact must contain four statements and no gaps")
  }
  const ids = artifact.statements.map((statement) => statement.id)
  if (
    artifact.status === "ready" &&
    representativeStatementIds.some(
      (id) => ids.filter((candidate) => candidate === id).length !== 1,
    )
  ) {
    throw new Error("ready query-plan artifact must contain each representative statement once")
  }
  for (const statement of artifact.statements) {
    exactKeys(statement as unknown as Record<string, unknown>, [
      "id",
      "statement",
      "statementSha256",
      "projection",
      "boundedRows",
      "plan",
    ])
    assertReadOnlyStatement(statement.statement)
    if (
      !representativeStatementIds.includes(statement.id) ||
      statement.boundedRows !== 21 ||
      statement.statement !== statement.statement.replaceAll(/\s+/g, " ").trim() ||
      !/^[a-f0-9]{64}$/.test(statement.statementSha256) ||
      sha256(statement.statement) !== statement.statementSha256 ||
      !Array.isArray(statement.projection) ||
      statement.projection.length !== applicationSummaryProjection.length ||
      statement.projection.some(
        (column, index) => column !== applicationSummaryProjection[index],
      ) ||
      !statement.plan ||
      typeof statement.plan !== "object"
    ) {
      throw new Error("invalid query-plan statement")
    }
    if (
      statement.statement !==
      canonicalRepresentativeStatements(artifact.fixture as FixtureScale)[statement.id]
    ) {
      throw new Error("query-plan statement differs from canonical application SQL")
    }
    exactKeys(statement.plan as unknown as Record<string, unknown>, [
      "planningMs",
      "executionMs",
      "actualRows",
      "actualTotalMs",
      "sharedHitBlocks",
      "sharedReadBlocks",
      "tempReadBlocks",
      "tempWrittenBlocks",
      "rowsRemovedByFilter",
      "nodeTypes",
    ])
    for (const metric of [
      "planningMs",
      "executionMs",
      "actualRows",
      "actualTotalMs",
      "sharedHitBlocks",
      "sharedReadBlocks",
      "tempReadBlocks",
      "tempWrittenBlocks",
      "rowsRemovedByFilter",
    ] as const) {
      nonnegativeMetric(statement.plan[metric], metric)
    }
    if (
      !Array.isArray(statement.plan.nodeTypes) ||
      statement.plan.nodeTypes.length === 0 ||
      new Set(statement.plan.nodeTypes).size !== statement.plan.nodeTypes.length ||
      statement.plan.nodeTypes.some(
        (nodeType) => typeof nodeType !== "string" || !allowedPlanNodeTypes.has(nodeType),
      )
    ) {
      throw new Error("query-plan statement has invalid node types")
    }
  }
  assertQueryPlanArtifactIsSanitized(artifact)
}

const sensitiveArtifactKeyParts = [
  "values",
  "params",
  "filter",
  "connection",
  "password",
  "secret",
  "token",
  "path",
] as const

const assertQueryPlanArtifactIsSanitized = (artifact: QueryPlanArtifact) => {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== "object") {
      if (
        typeof value === "string" &&
        (/postgres(?:ql)?:\/\//i.test(value) ||
          /\/(?:Users|home|tmp|private\/tmp|var\/folders)\//.test(value) ||
          /[A-Z]:\\+(?:Users|Temp)\\+/i.test(value) ||
          /https?:\/\/\S+\?\S+/i.test(value))
      ) {
        throw new Error("query-plan artifact contains sensitive data")
      }
      return
    }
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.replaceAll(/[_-]/g, "").toLowerCase()
      if (
        key !== "rowsRemovedByFilter" &&
        sensitiveArtifactKeyParts.some((part) => normalized.includes(part))
      ) {
        throw new Error(`query-plan artifact contains sensitive key: ${key}`)
      }
      visit(nested)
    }
  }
  visit(artifact)
}

type CompiledStatement = {
  id: QueryPlanStatement["id"]
  statement: string
  values: unknown[]
}

export type RepresentativeStatementContext = Parameters<typeof buildEntryListQueryConfig>[0]

type RepresentativeCompilerDatabase = {
  query: {
    entriesTable: {
      findMany: (config: ReturnType<typeof buildEntryListQueryConfig>) => {
        toSQL: () => { sql: string; params: unknown[] }
      }
    }
  }
}

export const compileRepresentativeStatement = (
  database: RepresentativeCompilerDatabase,
  id: QueryPlanStatement["id"],
  context: RepresentativeStatementContext,
): CompiledStatement => {
  const compiled = database.query.entriesTable.findMany(buildEntryListQueryConfig(context)).toSQL()
  assertReadOnlyStatement(compiled.sql)
  return { id, statement: compiled.sql, values: compiled.params }
}

type RepresentativeSubscription = EntryQuerySubscription & { id: string }

const buildRepresentativeContexts = (
  subscriptions: RepresentativeSubscription[],
  cursor: EntryCursor,
) => {
  const visibility: ActiveVisibilityState = {
    activeFeedIds: new Set(),
    activeListIds: new Set(),
    activeInboxIds: new Set(),
    sourceIdBySubscriptionId: new Map(),
  }
  for (const subscription of subscriptions) {
    const sourceId =
      subscription.type === "feed"
        ? subscription.feedId
        : subscription.type === "list"
          ? subscription.listId
          : subscription.inboxId
    if (!sourceId) continue
    visibility.sourceIdBySubscriptionId.set(subscription.id, sourceId)
    if (subscription.type === "feed") visibility.activeFeedIds.add(sourceId)
    if (subscription.type === "list") visibility.activeListIds.add(sourceId)
    if (subscription.type === "inbox") visibility.activeInboxIds.add(sourceId)
  }
  const activeFeedIds = Array.from(visibility.activeFeedIds)
  if (activeFeedIds.length === 0) throw new Error("fixture has no active timeline feeds")
  const base = { visibility, subscriptions, limit: 20 }
  return {
    timeline: { ...base, scope: { kind: "timeline" as const }, cursor: null },
    unread_timeline: {
      ...base,
      scope: { kind: "timeline" as const },
      read: false,
      cursor: null,
    },
    multi_feed: {
      ...base,
      scope: { kind: "feeds" as const, feedIds: activeFeedIds.slice(0, 3) },
      cursor: null,
    },
    stable_keyset: { ...base, scope: { kind: "timeline" as const }, cursor },
  } satisfies Record<QueryPlanStatement["id"], RepresentativeStatementContext>
}

const canonicalStatementCache = new Map<FixtureScale, Record<QueryPlanStatement["id"], string>>()

export function canonicalRepresentativeStatements(
  fixture: FixtureScale,
): Record<QueryPlanStatement["id"], string> {
  const cached = canonicalStatementCache.get(fixture)
  if (cached) return cached
  const manifest = buildFixtureManifest(fixture)
  const subscriptions = Array.from({ length: manifest.subscriptions }, (_, index) =>
    buildFixtureSubscription(fixture, "canonical", index),
  )
  const contexts = buildRepresentativeContexts(subscriptions, {
    v: 1,
    publishedAt: 100,
    insertedAt: 90,
    id: "canonical-entry",
  })
  const compiler = drizzle.mock({ schema }) as unknown as RepresentativeCompilerDatabase
  const statements = Object.fromEntries(
    representativeStatementIds.map((id) => [
      id,
      compileRepresentativeStatement(compiler, id, contexts[id]).statement,
    ]),
  ) as Record<QueryPlanStatement["id"], string>
  canonicalStatementCache.set(fixture, statements)
  return statements
}

export async function loadCurrentQueryPlanProvenance(): Promise<QueryPlanArtifact["provenance"]> {
  const [collectorSource, builderSource, cursorSourceText, serviceSource] = await Promise.all([
    readFile(fileURLToPath(import.meta.url)),
    readFile(queryBuilderSource),
    readFile(cursorSource),
    readFile(queryServiceSource),
  ])
  return {
    sourceSha256: hashApplicationQuerySources({
      builder: builderSource,
      cursor: cursorSourceText,
      service: serviceSource,
    }),
    collectorSha256: sha256(collectorSource),
  }
}

async function compileApplicationStatements(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    const db = drizzle(pool, { schema })
    const subscriptions = await db
      .select({
        id: subscriptionsTable.id,
        type: subscriptionsTable.type,
        feedId: subscriptionsTable.feedId,
        listId: subscriptionsTable.listId,
        inboxId: subscriptionsTable.inboxId,
        view: subscriptionsTable.view,
        isPrivate: subscriptionsTable.isPrivate,
        hideFromTimeline: subscriptionsTable.hideFromTimeline,
      })
      .from(subscriptionsTable)
      .where(isNull(subscriptionsTable.deletedAt))
    const cursorRows = await db
      .select({
        id: entriesTable.id,
        publishedAt: entriesTable.publishedAt,
        insertedAt: entriesTable.insertedAt,
      })
      .from(entriesTable)
      .where(isNull(entriesTable.deletedAt))
      .orderBy(desc(entriesTable.publishedAt), desc(entriesTable.insertedAt), desc(entriesTable.id))
      .limit(20)
    const cursorRow = cursorRows.at(-1)
    if (!cursorRow) throw new Error("fixture has no cursor row")
    const cursor: EntryCursor = { v: 1, ...cursorRow }
    const contexts = buildRepresentativeContexts(subscriptions, cursor)
    const compiler = db as unknown as RepresentativeCompilerDatabase
    const statements = representativeStatementIds.map((id) =>
      compileRepresentativeStatement(compiler, id, contexts[id]),
    )
    return { pool, statements }
  } catch (error) {
    await pool.end()
    throw error
  }
}

export async function collectQueryPlanArtifact(input: {
  fixture: FixtureScale
  databaseUrl?: string
  profileDir: string
}): Promise<QueryPlanArtifact> {
  const provenance = await loadCurrentQueryPlanProvenance()
  if (!input.databaseUrl) {
    return buildQueryPlanArtifact({
      fixture: input.fixture,
      ...provenance,
      statements: [],
      evidenceGap: "SUHUI_PERFORMANCE_DB_URL is unavailable",
    })
  }
  const databaseName = decodeURIComponent(new URL(input.databaseUrl).pathname.replace(/^\//, ""))
  await readHarnessTarget(input.profileDir, databaseName)
  const { pool, statements } = await compileApplicationStatements(input.databaseUrl)
  try {
    const client = await pool.connect()
    try {
      await client.query("BEGIN TRANSACTION READ ONLY")
      const artifacts: ArtifactStatementInput[] = []
      for (const statement of statements) {
        assertReadOnlyStatement(statement.statement)
        const result = await client.query({
          text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.statement}`,
          values: statement.values,
        })
        artifacts.push({
          id: statement.id,
          statement: statement.statement,
          projection: applicationSummaryProjection,
          boundedRows: 21,
          plan: sanitizeExplainPlan(result.rows[0]?.["QUERY PLAN"]),
        })
      }
      await client.query("ROLLBACK")
      return buildQueryPlanArtifact({
        fixture: input.fixture,
        ...provenance,
        statements: artifacts,
      })
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

const parseCli = (argv: readonly string[]) => {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index !== -1 ? argv[index + 1] : undefined
  }
  const fixture = value("--fixture")
  if (fixture !== "normal" && fixture !== "stress") throw new Error("--fixture is required")
  const normalizedFixture: FixtureScale = fixture
  const profileDir = value("--profile-dir")
  if (!profileDir) throw new Error("--profile-dir is required")
  return {
    fixture: normalizedFixture,
    profileDir,
    output: value("--output") ?? `out/performance/query-plans/${fixture}.json`,
  }
}

async function runCli(argv: readonly string[]) {
  const args = parseCli(argv)
  const artifact = await collectQueryPlanArtifact({
    fixture: args.fixture,
    databaseUrl: process.env.SUHUI_PERFORMANCE_DB_URL,
    profileDir: args.profileDir,
  })
  assertQueryPlanArtifact(artifact)
  await mkdir(dirname(resolve(args.output)), { recursive: true })
  await writeFile(args.output, `${JSON.stringify(artifact, null, 2)}\n`)
  process.exitCode = artifact.status === "ready" ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
