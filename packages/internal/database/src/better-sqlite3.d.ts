declare module "better-sqlite3" {
  export interface Statement {
    all: (...params: unknown[]) => unknown[]
    get: (...params: unknown[]) => unknown
    run: (...params: unknown[]) => unknown
  }

  export interface Database {
    pragma: (source: string) => unknown
    exec: (source: string) => void
    prepare: (source: string) => Statement
  }

  export type DatabaseConstructor = new (
    filename: string,
    options?: Record<string, unknown>,
  ) => Database

  const BetterSqlite3: DatabaseConstructor
  export default BetterSqlite3
}
