#!/usr/bin/env node

import { runCli } from "./run.js"

const result = await runCli({
  argv: process.argv.slice(2),
  env: process.env,
  fetch: globalThis.fetch,
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exitCode = result.exitCode
