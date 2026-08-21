import { DatabaseSync } from "node:sqlite"

import { afterEach, describe, expect, it } from "vitest"

import { activateMainDB, executeMainRawSql, getMainDialect, runInMainTransaction } from "./db.main"

/**
 * 用 node:sqlite 顶替 better-sqlite3（后者按 Electron ABI 编译，vitest 的 Node
 * 运行时加载不了），验证 sqlite 分支的裸 SQL 归一与事务语义。
 */
const makeSqliteHandles = () => {
  const raw = new DatabaseSync(":memory:")
  const sqlite = {
    exec: (sql: string) => raw.exec(sql),
    prepare: (sql: string) => {
      const stmt = raw.prepare(sql)
      return {
        all: (...params: unknown[]) => stmt.all(...(params as never[])),
        run: (...params: unknown[]) => {
          const info = stmt.run(...(params as never[]))
          return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) }
        },
      }
    },
    close: () => raw.close(),
    pragma: () => undefined,
  }
  return {
    raw,
    handles: { type: "sqlite" as const, config: { filePath: ":memory:" }, db: {} as never, sqlite },
  }
}

describe("sqlite 分支的裸 SQL 与事务", () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  const setup = () => {
    const { raw, handles } = makeSqliteHandles()
    cleanup = () => raw.close()
    activateMainDB(handles)
    raw.exec("create table t(id integer primary key, title text)")
    return raw
  }

  it("方言上报为 sqlite", () => {
    setup()
    expect(getMainDialect()).toBe("sqlite")
  })

  it("run 返回影响行数", async () => {
    setup()
    const result = await executeMainRawSql("insert into t (title) values (?)", ["a"], "run")

    expect(result.rowsAffected).toBe(1)
    expect(result.rows).toEqual([])
  })

  it("all 返回数组行而非对象行", async () => {
    const raw = setup()
    raw.exec("insert into t (id, title) values (1, 'first'), (2, 'second')")

    const result = await executeMainRawSql("select id, title from t order by id", [], "all")

    expect(result.rows).toEqual([
      [1, "first"],
      [2, "second"],
    ])
  })

  it("参数占位符用 ? 而非 $1", async () => {
    const raw = setup()
    raw.exec("insert into t (id, title) values (7, 'x')")

    const result = await executeMainRawSql("select title from t where id = ?", [7], "all")
    expect(result.rows).toEqual([["x"]])
  })

  it("事务成功时提交", async () => {
    const raw = setup()

    await runInMainTransaction(async () => {
      raw.exec("insert into t (id, title) values (1, 'committed')")
    })

    expect(raw.prepare("select count(*) c from t").get()).toMatchObject({ c: 1 })
  })

  it("事务抛错时回滚（异步回调也能工作）", async () => {
    const raw = setup()

    await expect(
      runInMainTransaction(async () => {
        raw.exec("insert into t (id, title) values (1, 'rolled back')")
        await Promise.resolve()
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    expect(raw.prepare("select count(*) c from t").get()).toMatchObject({ c: 0 })
  })
})
