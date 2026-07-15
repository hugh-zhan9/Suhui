import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"

import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"

import * as schema from "../../../../packages/internal/database/src/schemas/postgres.ts"
import { buildEntryListQueryConfig } from "../../layer/main/src/application/entry/query-builder.ts"
import type { QueryPlanArtifact, RepresentativeStatementContext } from "./query-plan.ts"
import {
  applicationSummaryProjection,
  assertQueryPlanArtifact,
  assertReadOnlyStatement,
  buildQueryPlanArtifact,
  compileRepresentativeStatement,
  hashApplicationQuerySources,
  representativeStatementIds,
  sanitizeExplainPlan,
} from "./query-plan.ts"
import { representativeTestStatements } from "./query-plan-test-fixtures.ts"

const completePlan = () => ({
  planningMs: 1,
  executionMs: 2,
  actualRows: 20,
  actualTotalMs: 1.9,
  sharedHitBlocks: 1,
  sharedReadBlocks: 0,
  tempReadBlocks: 0,
  tempWrittenBlocks: 0,
  rowsRemovedByFilter: 0,
  nodeTypes: ["Limit"],
})

const canonicalStatements = representativeTestStatements("stress")
const statementSha256 = (statement: string) => createHash("sha256").update(statement).digest("hex")

const completeArtifact = () =>
  buildQueryPlanArtifact({
    fixture: "stress",
    sourceSha256: "a".repeat(64),
    collectorSha256: "b".repeat(64),
    statements: representativeStatementIds.map((id) => ({
      id,
      statement: canonicalStatements[id],
      projection: applicationSummaryProjection,
      boundedRows: 21,
      plan: completePlan(),
    })),
  })

test("refuses write, DDL, and multiple statements before EXPLAIN", () => {
  for (const statement of [
    "insert into entries (id) values ($1)",
    "update entries set read = true",
    "delete from entries",
    "create index unsafe on entries (published_at)",
    "alter table entries add column unsafe text",
    "select id from entries; drop table entries",
  ]) {
    assert.throws(() => assertReadOnlyStatement(statement), /read-only SELECT/)
  }
  assert.doesNotThrow(() =>
    assertReadOnlyStatement(
      'select "id" from "entries" where "deleted_at" is null order by "published_at" desc limit $1',
    ),
  )
})

test("sanitizes a complete EXPLAIN envelope without filters, params, or credentials", () => {
  const sanitized = sanitizeExplainPlan([
    {
      Plan: {
        "Node Type": "Limit",
        "Actual Rows": 20,
        "Actual Total Time": 7.25,
        "Shared Hit Blocks": 31,
        "Shared Read Blocks": 0,
        "Temp Read Blocks": 0,
        "Temp Written Blocks": 0,
        Plans: [
          {
            "Node Type": "Seq Scan",
            "Relation Name": "entries",
            Filter: "(feed_id = 'secret-fixture-id')",
            "Rows Removed by Filter": 99980,
          },
        ],
      },
      "Planning Time": 1.25,
      "Execution Time": 7.5,
      connectionString: "postgres://user:password@127.0.0.1/private",
      params: ["secret-fixture-id"],
    },
  ])

  assert.deepEqual(sanitized, {
    planningMs: 1.25,
    executionMs: 7.5,
    actualRows: 20,
    actualTotalMs: 7.25,
    sharedHitBlocks: 31,
    sharedReadBlocks: 0,
    tempReadBlocks: 0,
    tempWrittenBlocks: 0,
    rowsRemovedByFilter: 99980,
    nodeTypes: ["Limit", "Seq Scan"],
  })
  assert.doesNotMatch(JSON.stringify(sanitized), /secret|postgres|params|connection/i)
})

test("rejects missing, non-finite, negative, and unknown EXPLAIN evidence", () => {
  const raw = [
    {
      Plan: {
        "Node Type": "Limit",
        "Actual Rows": 20,
        "Actual Total Time": 2,
        "Shared Hit Blocks": 1,
        "Shared Read Blocks": 0,
        "Temp Read Blocks": 0,
        "Temp Written Blocks": 0,
        "Rows Removed by Filter": 0,
      },
      "Planning Time": 1,
      "Execution Time": 2,
    },
  ]
  for (const mutate of [
    (candidate: Record<string, unknown>) => delete candidate["Planning Time"],
    (candidate: Record<string, unknown>) => (candidate["Execution Time"] = Number.NaN),
    (candidate: Record<string, unknown>) => (candidate["Execution Time"] = -1),
    (candidate: Record<string, unknown>) =>
      ((candidate.Plan as Record<string, unknown>)["Node Type"] = "Unsafe Scan"),
  ]) {
    const candidate = structuredClone(raw)[0] as Record<string, unknown>
    mutate(candidate)
    assert.throws(() => sanitizeExplainPlan([candidate]), /missing|invalid|unknown/i)
  }
})

test("missing EXPLAIN remains unverified with an explicit evidence gap", () => {
  const artifact = buildQueryPlanArtifact({
    fixture: "normal",
    sourceSha256: "a".repeat(64),
    collectorSha256: "b".repeat(64),
    statements: [],
    evidenceGap: "database execution unavailable",
  })
  assert.equal(artifact.status, "unverified")
  assert.deepEqual(artifact.evidenceGaps, ["database execution unavailable"])
})

test("rejects absolute temp/user paths from query-plan evidence gaps", () => {
  for (const evidenceGap of [
    "/tmp/no-such-plan.json",
    "/private/tmp/no-such-plan.json",
    "/var/folders/xx/no-such-plan.json",
    "/Users/example/no-such-plan.json",
    "C:\\Users\\example\\no-such-plan.json",
    "C:\\Temp\\no-such-plan.json",
  ]) {
    assert.throws(
      () =>
        buildQueryPlanArtifact({
          fixture: "normal",
          sourceSha256: "a".repeat(64),
          collectorSha256: "b".repeat(64),
          statements: [],
          evidenceGap,
        }),
      /sensitive data/,
    )
  }
})

test("application provenance changes when the production caller changes", () => {
  const base = hashApplicationQuerySources({
    builder: "shared-builder",
    cursor: "stable-cursor",
    service: "uses shared builder",
  })
  assert.notEqual(
    base,
    hashApplicationQuerySources({
      builder: "shared-builder",
      cursor: "stable-cursor",
      service: "stops using shared builder",
    }),
  )
})

test("a complete artifact is closed, exact, sanitized, and stores no bind values", () => {
  const artifact = completeArtifact()
  assert.equal(artifact.status, "ready")
  assert.equal("params" in artifact.statements[0]!, false)
  assert.deepEqual(artifact.statements[0]!.projection, applicationSummaryProjection)
  assert.doesNotMatch(JSON.stringify(artifact), /postgres(?:ql)?:\/\//i)
})

test("rejects self-hashed SELECT and application SQL contract drift", () => {
  const mutations: Array<(statement: string) => string> = [
    () => "select 1",
    (statement) => statement.replace('select "id", ', "select "),
    (statement) => statement.replace('"entriesTable"."deleted_at" is null', "true"),
    (statement) =>
      statement.replace('"entriesTable"."published_at" desc', '"entriesTable"."published_at" asc'),
    (statement) => statement.replace(/limit \$\d+$/, "limit 21"),
  ]
  for (const mutate of mutations) {
    const artifact = structuredClone(completeArtifact())
    const statement = mutate(artifact.statements[0]!.statement)
    artifact.statements[0]!.statement = statement
    artifact.statements[0]!.statementSha256 = statementSha256(statement)
    assert.throws(
      () => assertQueryPlanArtifact(artifact),
      /application SQL contract|query-plan statement/,
    )
  }
})

test("rejects self-hashed conjunction drift in every shape and limit placeholder drift", () => {
  for (const id of representativeStatementIds) {
    const artifact = structuredClone(completeArtifact())
    const target = artifact.statements.find((statement) => statement.id === id)!
    target.statement = target.statement.replace(" and ", " or ")
    target.statementSha256 = statementSha256(target.statement)
    assert.throws(() => assertQueryPlanArtifact(artifact), /canonical application SQL/)
  }

  const artifact = structuredClone(completeArtifact())
  const target = artifact.statements[0]!
  target.statement = target.statement.replace(/limit \$\d+$/, "limit $999999")
  target.statementSha256 = statementSha256(target.statement)
  assert.throws(() => assertQueryPlanArtifact(artifact), /canonical application SQL/)
})

test("closed artifact validation rejects duplicates, extra data, projection drift, and bad metrics", () => {
  const mutations: Array<(artifact: QueryPlanArtifact) => void> = [
    (artifact) => (artifact.statements[1]!.id = "timeline"),
    (artifact) => Object.assign(artifact.statements[0]!, { values: ["secret-fixture-id"] }),
    (artifact) => Object.assign(artifact.statements[0]!.plan, { Filter: "feed_id = secret" }),
    (artifact) => (artifact.statements[0]!.projection = ["id"]),
    (artifact) => (artifact.statements[0]!.plan.actualRows = -1),
    (artifact) => (artifact.statements[0]!.plan.executionMs = Number.NaN),
    (artifact) => (artifact.statements[0]!.plan.nodeTypes = []),
  ]
  for (const mutate of mutations) {
    const artifact = structuredClone(completeArtifact())
    mutate(artifact)
    assert.throws(() => assertQueryPlanArtifact(artifact))
  }
})

test("collector SQL and params exactly equal the production builder for all four shapes", () => {
  const pool = new pg.Pool({ connectionString: "postgres://unused:unused@127.0.0.1/unused" })
  const db = drizzle(pool, { schema })
  const visibility = {
    activeFeedIds: new Set(["feed-1", "feed-2", "feed-3"]),
    activeListIds: new Set(["list-1"]),
    activeInboxIds: new Set(["inbox-1"]),
    sourceIdBySubscriptionId: new Map([["subscription-1", "feed-1"]]),
  }
  const subscriptions = [
    {
      type: "feed" as const,
      feedId: "feed-1",
      view: 0,
      isPrivate: false,
      hideFromTimeline: false,
    },
    { type: "list" as const, listId: "list-1", view: 0, isPrivate: false },
  ]
  const base = { visibility, subscriptions, limit: 20 }
  const contexts: Record<
    (typeof representativeStatementIds)[number],
    RepresentativeStatementContext
  > = {
    timeline: { ...base, scope: { kind: "timeline" }, cursor: null },
    unread_timeline: {
      ...base,
      scope: { kind: "timeline" },
      read: false,
      cursor: null,
    },
    multi_feed: {
      ...base,
      scope: { kind: "feeds", feedIds: ["feed-1", "feed-2", "feed-3"] },
      cursor: null,
    },
    stable_keyset: {
      ...base,
      scope: { kind: "timeline" },
      cursor: { v: 1, publishedAt: 100, insertedAt: 90, id: "entry-20" },
    },
  }

  for (const id of representativeStatementIds) {
    const expected = db.query.entriesTable.findMany(buildEntryListQueryConfig(contexts[id])).toSQL()
    const actual = compileRepresentativeStatement(
      db as unknown as Parameters<typeof compileRepresentativeStatement>[0],
      id,
      contexts[id],
    )
    assert.equal(actual.statement, expected.sql)
    assert.deepEqual(actual.values, expected.params)
  }
  void pool.end()
})
