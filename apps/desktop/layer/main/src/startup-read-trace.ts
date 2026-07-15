const STARTUP_READ_TRACE_FLAGS = [
  "--debug-startup-read-trace",
  "--debug-startup-force-wide-read-trace",
] as const

export function isStartupReadTraceEnabled(argv: readonly string[] = process.argv) {
  return STARTUP_READ_TRACE_FLAGS.some((flag) => argv.includes(flag))
}

export function debugStartupReadTrace(
  message: string,
  getData: () => unknown,
  write: (message: string, data: unknown) => void,
) {
  if (!isStartupReadTraceEnabled()) return
  write(message, getData())
}
