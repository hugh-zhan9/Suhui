export type RuntimeDbType = "postgres" | "sqlite"

let runtimeDbType: RuntimeDbType | null = null

type Listener = (dbType: RuntimeDbType) => void
const listeners = new Set<Listener>()

/**
 * 方言变化的订阅点。
 *
 * `schemas/index.ts` 用它把导出的表对象重绑到当前方言：drizzle 的值编解码
 * （boolean ↔ 0/1、JSON ↔ 文本）挂在**表的列对象**上，拿 Postgres 的表去查
 * SQLite 会把 `true` 原样绑进去，报 "SQLite3 can only bind numbers, strings,
 * bigints, buffers, and null"。用 Proxy 转发不行——drizzle 的 `is()` 判定会失败
 * 并无限递归；ES 实时绑定（`export let` + 重新赋值）才是可行解。
 */
export const onRuntimeDbTypeChange = (listener: Listener) => {
  listeners.add(listener)
  listener(getRuntimeDbType())
  return () => listeners.delete(listener)
}

/**
 * 由主进程在数据库初始化时设定；渲染层经 IPC 得知方言后设定同一个值。
 * 未设定时回落到 postgres，以免在接线完成前改变既有行为。
 */
export const setRuntimeDbType = (dbType: RuntimeDbType) => {
  runtimeDbType = dbType
  for (const listener of listeners) listener(dbType)
}

export const resetRuntimeDbType = () => {
  runtimeDbType = null
  const fallback = getRuntimeDbType()
  for (const listener of listeners) listener(fallback)
}

export const getRuntimeDbType = (): RuntimeDbType => {
  if (runtimeDbType) return runtimeDbType
  // 测试与早期启动阶段可用全局变量指定
  return (globalThis as { __followDbType?: string }).__followDbType === "sqlite"
    ? "sqlite"
    : "postgres"
}
