#!/usr/bin/env tsx

import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { like } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import {
  entriesTable,
  feedsTable,
  subscriptionsTable,
  unreadTable,
} from "../../../../packages/internal/database/src/schemas/postgres.ts"
import type {
  EntrySchema,
  FeedSchema,
  SubscriptionSchema,
  UnreadSchema,
} from "../../../../packages/internal/database/src/schemas/types.ts"
import type * as schema from "../../../../packages/internal/database/src/schemas/postgres.ts"

import type { FixtureManifest, FixtureScale } from "./contracts.ts"

export const FIXTURE_SEED = "suhui-performance-v1"
export const TARGET_MARKER_FILE = ".suhui-performance-target.json"

const TARGET_OWNER = "suhui-performance-harness" as const
const TARGET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/
const BASE_PUBLISHED_AT = Date.UTC(2025, 0, 1)

export type HarnessTarget = {
  version: 1
  owner: typeof TARGET_OWNER
  targetId: string
  databaseName: string
  profileId: string
}

export type FixtureEntry = EntrySchema & { bodyBytes: number }

export type FixtureRowSource = {
  feeds: Iterable<readonly FeedSchema[]>
  subscriptions: Iterable<readonly SubscriptionSchema[]>
  entries: Iterable<readonly EntrySchema[]>
  unread: Iterable<readonly UnreadSchema[]>
}

export type FixtureStore = {
  cleanup(prefix: string): Promise<unknown>
  insertFeeds(rows: readonly FeedSchema[]): Promise<unknown>
  insertSubscriptions(rows: readonly SubscriptionSchema[]): Promise<unknown>
  insertEntries(rows: readonly EntrySchema[]): Promise<unknown>
  insertUnread(rows: readonly UnreadSchema[]): Promise<unknown>
}

const manifestCounts: Record<FixtureScale, Pick<FixtureManifest, "subscriptions" | "entries">> = {
  normal: { subscriptions: 400, entries: 10_000 },
  stress: { subscriptions: 800, entries: 100_000 },
}

export function buildFixtureManifest(scale: FixtureScale): FixtureManifest {
  return {
    version: 1,
    seed: FIXTURE_SEED,
    scale,
    ...manifestCounts[scale],
    viewDistribution: { articles: 60, social: 20, pictures: 10, videos: 10 },
    privateRate: 0.05,
    hideFromTimelineRate: 0.05,
    readDistribution: { false: 60, true: 35, null: 5 },
    sharedPublishedAtMinimumRate: 0.1,
    bodyBytes: { p50: 8 * 1024, p95: 64 * 1024, max: 256 * 1024 },
    includes: { media: true, attachments: true, sources: true },
  }
}

const normalizeTargetForDatabase = (targetId: string) => targetId.replaceAll("-", "_")

export function buildHarnessTarget(targetId: string): HarnessTarget {
  if (!TARGET_ID_PATTERN.test(targetId)) {
    throw new Error("target id must contain only lowercase letters, numbers, or hyphens")
  }
  return {
    version: 1,
    owner: TARGET_OWNER,
    targetId,
    databaseName: `suhui_performance_${normalizeTargetForDatabase(targetId)}`,
    profileId: `suhui-performance-${targetId}`,
  }
}

export function assertHarnessTarget(
  marker: HarnessTarget,
  profileDir: string,
  databaseName: string,
): HarnessTarget {
  const expected = buildHarnessTarget(marker.targetId)
  if (marker.version !== 1 || marker.owner !== TARGET_OWNER) {
    throw new Error("fixture writes require a harness-owned marker")
  }
  if (marker.databaseName !== expected.databaseName || databaseName !== expected.databaseName) {
    throw new Error("fixture database does not match the isolated harness database")
  }
  if (
    marker.profileId !== expected.profileId ||
    basename(resolve(profileDir)) !== expected.profileId
  ) {
    throw new Error("fixture profile does not match the isolated harness profile")
  }
  return marker
}

export async function createHarnessTarget(input: {
  targetId: string
  databaseName: string
  profileDir: string
}): Promise<HarnessTarget> {
  const marker = buildHarnessTarget(input.targetId)
  assertHarnessTarget(marker, input.profileDir, input.databaseName)

  await mkdir(input.profileDir, { recursive: true })
  const markerPath = join(input.profileDir, TARGET_MARKER_FILE)
  const contents = await readdir(input.profileDir)
  if (contents.length > 0 && !contents.includes(TARGET_MARKER_FILE)) {
    throw new Error("refusing to mark a non-empty profile as a performance harness target")
  }
  if (contents.includes(TARGET_MARKER_FILE)) {
    const existing = JSON.parse(await readFile(markerPath, "utf8")) as HarnessTarget
    return assertHarnessTarget(existing, input.profileDir, input.databaseName)
  }

  await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, { flag: "wx" })
  return marker
}

export async function readHarnessTarget(
  profileDir: string,
  databaseName: string,
): Promise<HarnessTarget> {
  let raw: string
  try {
    raw = await readFile(join(profileDir, TARGET_MARKER_FILE), "utf8")
  } catch {
    throw new Error("fixture writes require an existing harness-owned marker")
  }
  return assertHarnessTarget(JSON.parse(raw) as HarnessTarget, profileDir, databaseName)
}

export function fixtureTargetSummary(marker: HarnessTarget) {
  return {
    targetId: marker.targetId,
    databaseName: marker.databaseName,
    profileId: marker.profileId,
  }
}

const stableToken = (targetId: string) =>
  createHash("sha256").update(`${FIXTURE_SEED}:${targetId}`).digest("hex").slice(0, 12)

export const targetRowPrefix = (target: Pick<HarnessTarget, "targetId">) =>
  `suhui_perf_${stableToken(target.targetId)}_`

export const literalPrefixLikePattern = (prefix: string) =>
  `${prefix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`

const scalePrefix = (scale: FixtureScale, targetId: string) =>
  `${targetRowPrefix({ targetId })}${scale}_`

const padded = (value: number, width = 6) => String(value).padStart(width, "0")

const distributionBucket = (index: number, total: number, percentages: readonly number[]) => {
  let boundary = 0
  for (let bucket = 0; bucket < percentages.length; bucket += 1) {
    boundary += Math.round(total * (percentages[bucket]! / 100))
    if (index < boundary) return bucket
  }
  return percentages.length - 1
}

export function buildFixtureFeed(scale: FixtureScale, targetId: string, index: number): FeedSchema {
  const prefix = scalePrefix(scale, targetId)
  const id = `${prefix}feed_${padded(index)}`
  return {
    id,
    title: `Fixture feed ${padded(index)}`,
    url: `https://fixture.invalid/${id}.xml`,
    siteUrl: `https://fixture.invalid/${id}`,
    updatedAt: BASE_PUBLISHED_AT,
  }
}

export function buildFixtureSubscription(
  scale: FixtureScale,
  targetId: string,
  index: number,
): SubscriptionSchema {
  const manifest = buildFixtureManifest(scale)
  if (index < 0 || index >= manifest.subscriptions)
    throw new RangeError("subscription index out of range")
  const prefix = scalePrefix(scale, targetId)
  const feed = buildFixtureFeed(scale, targetId, index)
  return {
    id: `${prefix}subscription_${padded(index)}`,
    feedId: feed.id,
    listId: null,
    inboxId: null,
    userId: `${prefix}user`,
    view: distributionBucket(index, manifest.subscriptions, [60, 20, 10, 10]),
    isPrivate: index < Math.round(manifest.subscriptions * manifest.privateRate),
    hideFromTimeline:
      index >= Math.round(manifest.subscriptions * manifest.privateRate) &&
      index <
        Math.round(manifest.subscriptions * (manifest.privateRate + manifest.hideFromTimelineRate)),
    title: `Fixture subscription ${padded(index)}`,
    category: `Fixture ${Math.floor(index / 20)}`,
    createdAt: new Date(BASE_PUBLISHED_AT).toISOString(),
    type: "feed",
  }
}

const fixtureBodyBytes = (index: number, total: number, manifest: FixtureManifest) => {
  if (index < Math.ceil(total * 0.5)) return manifest.bodyBytes.p50
  if (index < Math.ceil(total * 0.95)) return manifest.bodyBytes.p95
  return manifest.bodyBytes.max
}

export function buildFixtureEntry(
  scale: FixtureScale,
  targetId: string,
  index: number,
  materializeBody = true,
): FixtureEntry {
  const manifest = buildFixtureManifest(scale)
  if (index < 0 || index >= manifest.entries) throw new RangeError("entry index out of range")
  const prefix = scalePrefix(scale, targetId)
  const subscriptionIndex = index % manifest.subscriptions
  const bodyBytes = fixtureBodyBytes(index, manifest.entries, manifest)
  const sharedCount = Math.ceil(manifest.entries * manifest.sharedPublishedAtMinimumRate)
  const publishedAt = index < sharedCount ? BASE_PUBLISHED_AT : BASE_PUBLISHED_AT - index * 60_000
  const readBucket = distributionBucket(index, manifest.entries, [60, 35, 5])
  const withRichPayload = index % 20 === 0

  return {
    id: `${prefix}entry_${padded(index, 8)}`,
    title: `Fixture entry ${padded(index, 8)}`,
    url: `https://fixture.invalid/entry/${padded(index, 8)}`,
    content: materializeBody ? "x".repeat(bodyBytes) : null,
    readabilityContent: null,
    description: `Fixture summary ${padded(index, 8)}`,
    guid: `${prefix}guid_${padded(index, 8)}`,
    author: "Suhui performance harness",
    insertedAt: BASE_PUBLISHED_AT + index,
    publishedAt,
    media: withRichPayload
      ? [{ type: "photo", url: `https://fixture.invalid/media/${padded(index, 8)}.jpg` }]
      : null,
    attachments: withRichPayload
      ? [
          {
            url: `https://fixture.invalid/attachment/${padded(index, 8)}.bin`,
            mime_type: "application/octet-stream",
            size_in_bytes: 1024,
          },
        ]
      : null,
    feedId: `${prefix}feed_${padded(subscriptionIndex)}`,
    read: readBucket === 0 ? false : readBucket === 1 ? true : null,
    sources: withRichPayload ? [`fixture-source-${padded(index, 8)}`] : null,
    bodyBytes,
  }
}

const batches = function* <T>(count: number, batchSize: number, build: (index: number) => T) {
  for (let start = 0; start < count; start += batchSize) {
    const rows: T[] = []
    for (let index = start; index < Math.min(start + batchSize, count); index += 1) {
      rows.push(build(index))
    }
    yield rows
  }
}

export function buildFixtureRows(scale: FixtureScale, targetId: string): FixtureRowSource {
  const manifest = buildFixtureManifest(scale)
  const unreadBySubscription = Array.from({ length: manifest.subscriptions }, () => 0)
  for (let index = 0; index < manifest.entries; index += 1) {
    const readBucket = distributionBucket(index, manifest.entries, [60, 35, 5])
    if (readBucket !== 1) unreadBySubscription[index % manifest.subscriptions]! += 1
  }

  return {
    feeds: batches(manifest.subscriptions, 200, (index) =>
      buildFixtureFeed(scale, targetId, index),
    ),
    subscriptions: batches(manifest.subscriptions, 200, (index) =>
      buildFixtureSubscription(scale, targetId, index),
    ),
    entries: batches(manifest.entries, 100, (index) => {
      const { bodyBytes: _, ...entry } = buildFixtureEntry(scale, targetId, index, true)
      return entry
    }),
    unread: batches(manifest.subscriptions, 200, (index) => ({
      id: buildFixtureSubscription(scale, targetId, index).id,
      count: unreadBySubscription[index]!,
    })),
  }
}

const insertAll = async <T>(
  groups: Iterable<readonly T[]>,
  insert: (rows: readonly T[]) => Promise<unknown>,
) => {
  for (const rows of groups) {
    if (rows.length > 0) await insert(rows)
  }
}

export async function loadFixtureRows(
  store: FixtureStore,
  target: HarnessTarget,
  rows: FixtureRowSource,
): Promise<void> {
  const expected = buildHarnessTarget(target.targetId)
  if (target.owner !== TARGET_OWNER || target.databaseName !== expected.databaseName) {
    throw new Error("fixture writes require a harness-owned marker")
  }
  const prefix = targetRowPrefix(target)
  await store.cleanup(prefix)
  try {
    await insertAll(rows.feeds, (batch) => store.insertFeeds(batch))
    await insertAll(rows.subscriptions, (batch) => store.insertSubscriptions(batch))
    await insertAll(rows.entries, (batch) => store.insertEntries(batch))
    await insertAll(rows.unread, (batch) => store.insertUnread(batch))
  } catch (error) {
    await store.cleanup(prefix)
    throw error
  }
}

type FixtureDatabase = NodePgDatabase<typeof schema>

export function createDrizzleFixtureStore(db: FixtureDatabase): FixtureStore {
  return {
    cleanup: async (prefix) => {
      const pattern = literalPrefixLikePattern(prefix)
      await db.delete(entriesTable).where(like(entriesTable.id, pattern)).execute()
      await db.delete(unreadTable).where(like(unreadTable.id, pattern)).execute()
      await db.delete(subscriptionsTable).where(like(subscriptionsTable.id, pattern)).execute()
      await db.delete(feedsTable).where(like(feedsTable.id, pattern)).execute()
    },
    insertFeeds: async (rows) =>
      db
        .insert(feedsTable)
        .values([...rows])
        .execute(),
    insertSubscriptions: async (rows) =>
      db
        .insert(subscriptionsTable)
        .values([...rows])
        .execute(),
    insertEntries: async (rows) =>
      db
        .insert(entriesTable)
        .values([...rows])
        .execute(),
    insertUnread: async (rows) =>
      db
        .insert(unreadTable)
        .values([...rows])
        .execute(),
  }
}

type CliArgs = {
  scale: FixtureScale
  targetId: string
  profileDir?: string
  dryRun: boolean
  initialize: boolean
  cleanup: boolean
}

const parseArgs = (argv: readonly string[]): CliArgs => {
  const parsed: Partial<CliArgs> = { dryRun: false, initialize: false, cleanup: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]
    if (arg === "--") continue
    if (arg === "--scale" && (value === "normal" || value === "stress")) {
      parsed.scale = value
      index += 1
    } else if (arg === "--target-id" && value) {
      parsed.targetId = value
      index += 1
    } else if (arg === "--profile-dir" && value) {
      parsed.profileDir = value
      index += 1
    } else if (arg === "--dry-run") parsed.dryRun = true
    else if (arg === "--initialize") parsed.initialize = true
    else if (arg === "--cleanup") parsed.cleanup = true
    else throw new Error(`unknown or incomplete argument: ${arg}`)
  }
  if (!parsed.scale) throw new Error("--scale must be normal or stress")
  if (!parsed.targetId) throw new Error("--target-id is required")
  return parsed as CliArgs
}

const databaseNameFromUrl = (databaseUrl: string) => {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""))
  if (!name) throw new Error("performance database URL must name an isolated database")
  return name
}

async function runCli(argv: readonly string[]) {
  const args = parseArgs(argv)
  const expectedTarget = buildHarnessTarget(args.targetId)
  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          target: fixtureTargetSummary(expectedTarget),
          manifest: buildFixtureManifest(args.scale),
        },
        null,
        2,
      ),
    )
    return
  }

  if (!args.profileDir) throw new Error("--profile-dir is required unless --dry-run is used")
  const databaseUrl = process.env.SUHUI_PERFORMANCE_DB_URL
  if (!databaseUrl) throw new Error("SUHUI_PERFORMANCE_DB_URL is required for fixture writes")
  const databaseName = databaseNameFromUrl(databaseUrl)
  const target = args.initialize
    ? await createHarnessTarget({
        targetId: args.targetId,
        databaseName,
        profileDir: args.profileDir,
      })
    : await readHarnessTarget(args.profileDir, databaseName)

  const [{ drizzle }, pgModule] = await Promise.all([
    import("drizzle-orm/node-postgres"),
    import("pg"),
  ])
  const pool = new pgModule.default.Pool({ connectionString: databaseUrl })
  try {
    const db = drizzle(pool, {
      schema: await import("../../../../packages/internal/database/src/schemas/postgres.ts"),
    })
    const store = createDrizzleFixtureStore(db)
    if (args.cleanup) await store.cleanup(targetRowPrefix(target))
    else await loadFixtureRows(store, target, buildFixtureRows(args.scale, args.targetId))
    console.log(
      JSON.stringify({
        target: fixtureTargetSummary(target),
        manifest: buildFixtureManifest(args.scale),
      }),
    )
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
