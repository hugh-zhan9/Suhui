import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { test } from "node:test"

import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

import {
  FIXTURE_SEED,
  assertHarnessTarget,
  buildFixtureEntry,
  buildFixtureManifest,
  buildFixtureSubscription,
  createDrizzleFixtureStore,
  createHarnessTarget,
  fixtureTargetSummary,
  literalPrefixLikePattern,
  loadFixtureRows,
  targetRowPrefix,
} from "./fixture.ts"

const matchesPostgresLikePattern = (value: string, pattern: string) => {
  let source = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!
    if (character === "\\") {
      index += 1
      const escaped = pattern[index]
      if (escaped === undefined) throw new Error("invalid LIKE escape")
      source += escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    } else if (character === "%") source += ".*"
    else if (character === "_") source += "."
    else source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`${source}$`, "s").test(value)
}

test("builds exact normal and stress manifests from one fixed seed", () => {
  const normal = buildFixtureManifest("normal")
  const stress = buildFixtureManifest("stress")

  assert.deepEqual(
    { subscriptions: normal.subscriptions, entries: normal.entries },
    { subscriptions: 400, entries: 10_000 },
  )
  assert.deepEqual(
    { subscriptions: stress.subscriptions, entries: stress.entries },
    { subscriptions: 800, entries: 100_000 },
  )
  assert.equal(normal.seed, FIXTURE_SEED)
  assert.equal(stress.seed, FIXTURE_SEED)
  assert.deepEqual(normal.viewDistribution, { articles: 60, social: 20, pictures: 10, videos: 10 })
  assert.deepEqual(stress.viewDistribution, normal.viewDistribution)
  assert.deepEqual(normal.readDistribution, { false: 60, true: 35, null: 5 })
  assert.deepEqual(stress.readDistribution, normal.readDistribution)
  assert.deepEqual(normal.bodyBytes, { p50: 8 * 1024, p95: 64 * 1024, max: 256 * 1024 })
  assert.deepEqual(normal.includes, { media: true, attachments: true, sources: true })
})

test("generates deterministic IDs and exact integer-rounded distributions", () => {
  for (const scale of ["normal", "stress"] as const) {
    const manifest = buildFixtureManifest(scale)
    const subscriptions = Array.from({ length: manifest.subscriptions }, (_, index) =>
      buildFixtureSubscription(scale, "repeatable", index),
    )
    const entries = Array.from({ length: manifest.entries }, (_, index) =>
      buildFixtureEntry(scale, "repeatable", index, false),
    )

    assert.equal(new Set(subscriptions.map((row) => row.id)).size, manifest.subscriptions)
    assert.equal(new Set(entries.map((row) => row.id)).size, manifest.entries)
    assert.deepEqual(buildFixtureSubscription(scale, "repeatable", 7), subscriptions[7])
    assert.deepEqual(buildFixtureEntry(scale, "repeatable", 7, false), entries[7])

    const views = subscriptions.reduce<Record<number, number>>((counts, row) => {
      counts[row.view] = (counts[row.view] ?? 0) + 1
      return counts
    }, {})
    assert.deepEqual(views, {
      0: Math.round(manifest.subscriptions * 0.6),
      1: Math.round(manifest.subscriptions * 0.2),
      2: Math.round(manifest.subscriptions * 0.1),
      3: Math.round(manifest.subscriptions * 0.1),
    })
    assert.equal(
      subscriptions.filter((row) => row.isPrivate).length,
      Math.round(manifest.subscriptions * 0.05),
    )
    assert.equal(
      subscriptions.filter((row) => row.hideFromTimeline).length,
      Math.round(manifest.subscriptions * 0.05),
    )

    const reads = { false: 0, true: 0, null: 0 }
    for (const row of entries) reads[String(row.read) as keyof typeof reads] += 1
    assert.deepEqual(reads, {
      false: Math.round(manifest.entries * 0.6),
      true: Math.round(manifest.entries * 0.35),
      null: Math.round(manifest.entries * 0.05),
    })

    const feedCounts = entries.reduce<Map<string, number>>((counts, row) => {
      counts.set(row.feedId, (counts.get(row.feedId) ?? 0) + 1)
      return counts
    }, new Map())
    assert.equal(Math.max(...feedCounts.values()) - Math.min(...feedCounts.values()), 0)
    assert.ok(
      entries.filter((row) => row.publishedAt === entries[0]?.publishedAt).length >=
        Math.ceil(manifest.entries * manifest.sharedPublishedAtMinimumRate),
    )

    const bodySizes = entries.map((row) => row.bodyBytes).sort((a, b) => a - b)
    assert.equal(bodySizes[Math.ceil(bodySizes.length * 0.5) - 1], manifest.bodyBytes.p50)
    assert.equal(bodySizes[Math.ceil(bodySizes.length * 0.95) - 1], manifest.bodyBytes.p95)
    assert.equal(bodySizes.at(-1), manifest.bodyBytes.max)
    assert.ok(entries.some((row) => row.media && row.attachments && row.sources))
  }
})

test("materializes the requested ASCII body byte size", () => {
  const row = buildFixtureEntry("normal", "body", 9_999, true)
  assert.equal(Buffer.byteLength(row.content ?? ""), row.bodyBytes)
  assert.equal(row.bodyBytes, 256 * 1024)
})

test("requires a harness-owned database and profile marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "suhui-performance-test-"))
  const profileDir = join(root, "suhui-performance-isolated-a")
  const marker = await createHarnessTarget({
    targetId: "isolated-a",
    databaseName: "suhui_performance_isolated_a",
    profileDir,
  })

  assert.equal(basename(profileDir), marker.profileId)
  assert.deepEqual(assertHarnessTarget(marker, profileDir, "suhui_performance_isolated_a"), marker)
  assert.deepEqual(
    JSON.parse(await readFile(join(profileDir, ".suhui-performance-target.json"), "utf8")),
    marker,
  )
  assert.deepEqual(fixtureTargetSummary(marker), {
    targetId: "isolated-a",
    databaseName: "suhui_performance_isolated_a",
    profileId: "suhui-performance-isolated-a",
  })

  assert.throws(
    () =>
      assertHarnessTarget({ ...marker, owner: "user" as never }, profileDir, marker.databaseName),
    /harness-owned marker/,
  )
  assert.throws(() => assertHarnessTarget(marker, root, marker.databaseName), /profile/)
  assert.throws(() => assertHarnessTarget(marker, profileDir, "suhui"), /database/)
  await assert.rejects(
    createHarnessTarget({
      targetId: "normal",
      databaseName: "suhui",
      profileDir: join(root, "normal"),
    }),
    /database/,
  )
})

test("cleans only the target prefix before load and after a partial failure", async () => {
  const marker = {
    version: 1 as const,
    owner: "suhui-performance-harness" as const,
    targetId: "partial",
    databaseName: "suhui_performance_partial",
    profileId: "suhui-performance-partial",
  }
  const calls: string[] = []
  const store = {
    cleanup: async (prefix: string) => calls.push(`cleanup:${prefix}`),
    insertFeeds: async () => calls.push("feeds"),
    insertSubscriptions: async () => {
      calls.push("subscriptions")
      throw new Error("injected write failure")
    },
    insertEntries: async () => calls.push("entries"),
    insertUnread: async () => calls.push("unread"),
  }

  await assert.rejects(
    loadFixtureRows(store, marker, {
      feeds: [[{ id: "f" } as never]],
      subscriptions: [[{ id: "s" } as never]],
      entries: [],
      unread: [],
    }),
    /injected write failure/,
  )
  assert.deepEqual(calls, [
    `cleanup:${targetRowPrefix(marker)}`,
    "feeds",
    "subscriptions",
    `cleanup:${targetRowPrefix(marker)}`,
  ])

  calls.length = 0
  await store.cleanup(targetRowPrefix(marker))
  await store.cleanup(targetRowPrefix(marker))
  assert.deepEqual(calls, [
    `cleanup:${targetRowPrefix(marker)}`,
    `cleanup:${targetRowPrefix(marker)}`,
  ])
})

test("escapes cleanup prefixes so LIKE cannot select underscore near-matches", async () => {
  const prefix = targetRowPrefix({ targetId: "literal-prefix" })
  const nearMatch = prefix.replaceAll("_", "x") + "normal_entry_00000000"
  const predicates: SQL[] = []
  const db = {
    delete: () => ({
      where: (predicate: SQL) => ({
        execute: async () => predicates.push(predicate),
      }),
    }),
  }

  await createDrizzleFixtureStore(db as never).cleanup(prefix)

  const expectedPattern = literalPrefixLikePattern(prefix)
  assert.equal(expectedPattern, `${prefix.replaceAll("_", "\\_")}%`)
  assert.equal(matchesPostgresLikePattern(`${prefix}normal_entry_00000000`, expectedPattern), true)
  assert.equal(matchesPostgresLikePattern(nearMatch, expectedPattern), false)
  assert.equal(predicates.length, 4)

  const dialect = new PgDialect()
  for (const predicate of predicates) {
    const query = dialect.sqlToQuery(predicate)
    assert.match(query.sql, / like \$1$/)
    assert.deepEqual(query.params, [expectedPattern])
  }
})
