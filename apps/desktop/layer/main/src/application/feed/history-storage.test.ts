import { DatabaseSync } from "node:sqlite"

import { sqliteMigrations } from "@suhui/database/drizzle/sqlite-baseline"
import { resetRuntimeDbType, setRuntimeDbType } from "@suhui/database/schemas/runtime"
import * as schema from "@suhui/database/schemas/sqlite"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { insertMissingHistoryArticles } from "./history-service"

const mocks = vi.hoisted(() => ({ db: undefined as unknown, process: vi.fn(async () => {}) }))
vi.mock("~/manager/db", () => ({ DBManager: { getDB: () => mocks.db } }))
vi.mock("../local-reading/pipeline", () => ({
  localReadingPipeline: { processNewEntries: mocks.process },
}))

let raw: DatabaseSync
const source = { url: "https://blog.test/feed.xml", siteUrl: "https://blog.test/" }
const article = (path: string) => ({
  url: `https://blog.test/${path}/`,
  title: `历史 ${path}`,
  description: "摘要",
  content: "<p>正文</p>",
  publishedAt: 100,
  dateSource: "time-attr" as const,
})
beforeEach(() => {
  setRuntimeDbType("sqlite")
  raw = new DatabaseSync(":memory:")
  for (const migration of sqliteMigrations) for (const sql of migration.statements) raw.exec(sql)
  mocks.db = drizzle(
    async (sql, params, method) => {
      const stmt = raw.prepare(sql)
      if (method === "run") {
        stmt.run(...params)
        return { rows: [] }
      }
      stmt.setReturnArrays(true)
      return {
        rows:
          method === "get"
            ? (stmt.get(...params) as unknown as unknown[])
            : (stmt.all(...params) as unknown as unknown[][]),
      }
    },
    { schema },
  )
  raw.exec(`insert into feeds (id,url,site_url) values ('f1','https://blog.test/feed.xml','https://blog.test/');
    insert into subscriptions(id,feed_id,user_id,type,view,is_private) values ('s1','f1','local','feed',0,0);
    insert into entries(id,feed_id,url,guid,title,content,read,published_at,inserted_at) values ('existing','f1','https://blog.test/existing','old-guid','原题','原文',1,1,1);
    insert into entries(id,feed_id,url,guid,title,read,published_at,inserted_at,deleted_at) values ('deleted','f1','https://blog.test/deleted','deleted-guid','已删除',1,1,1,2);`)
  mocks.process.mockClear()
})
afterEach(() => {
  raw.close()
  resetRuntimeDbType()
})

it("inserts only missing articles and preserves existing read/content and tombstones in real SQLite", async () => {
  expect(
    await insertMissingHistoryArticles("f1", source, [
      article("existing"),
      article("deleted"),
      article("new"),
      article("new"),
    ]),
  ).toBe(1)
  expect(
    raw.prepare("select id,title,content,read from entries where id='existing'").get(),
  ).toEqual({ id: "existing", title: "原题", content: "原文", read: 1 })
  expect(raw.prepare("select deleted_at from entries where id='deleted'").get()).toEqual({
    deleted_at: 2,
  })
  const added = raw
    .prepare("select id,read,content,published_at from entries where url='https://blog.test/new/'")
    .get()
  expect(added).toMatchObject({
    id: expect.stringMatching(/^local_history_/),
    read: 0,
    content: "<p>正文</p>",
    published_at: 100,
  })
  expect(mocks.process).toHaveBeenCalledWith([added!.id])
  expect(await insertMissingHistoryArticles("f1", source, [article("new")])).toBe(0)
  expect(mocks.process).toHaveBeenCalledTimes(1)
})
it("rejects removed subscriptions and source changes before inserting", async () => {
  raw.exec("update feeds set url='https://blog.test/other.xml' where id='f1'")
  await expect(insertMissingHistoryArticles("f1", source, [article("new")])).rejects.toThrow(
    "地址已改变",
  )
  raw.exec("update subscriptions set deleted_at=123 where id='s1'")
  await expect(insertMissingHistoryArticles("f1", source, [article("new")])).rejects.toThrow(
    "已不存在",
  )
  expect(raw.prepare("select count(*) as n from entries").get()).toEqual({ n: 2 })
})
