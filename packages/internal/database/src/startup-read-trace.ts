const STARTUP_READ_TRACE_FLAGS = [
  "--debug-startup-read-trace",
  "--debug-startup-force-wide-read-trace",
] as const

type StartupReadTraceGlobal = typeof globalThis & {
  __startupReadTraceFlags?: { enabled?: boolean }
}

export function isStartupReadTraceEnabled(
  argv: readonly string[] = typeof process === "undefined" ? [] : process.argv,
) {
  if ((globalThis as StartupReadTraceGlobal).__startupReadTraceFlags?.enabled === true) return true
  return STARTUP_READ_TRACE_FLAGS.some((flag) => argv.includes(flag))
}

export function debugStartupReadTrace(message: string, getData: () => unknown) {
  if (!isStartupReadTraceEnabled()) return
  console.info(message, getData())
}
