#!/usr/bin/env node

import { execSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const MAX_COMMITS = 20

export function normalizeCommits(commits) {
  return commits
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^merge\b/i.test(line))
    .filter((line) => !/^release\(desktop\):\s*release\b/i.test(line))
    .filter((line) => !/thanks|contributors?/i.test(line))
}

export function buildReleaseNotes(version, commits) {
  const normalized = normalizeCommits(commits).slice(0, MAX_COMMITS)
  const commitLines =
    normalized.length > 0
      ? normalized.map((line) => `- ${line}`).join("\n")
      : "- 本次未检测到可展示的提交摘要。"

  return `# FreeFolo ${version} 发布说明

## 本次更新
- 本版本为 FreeFolo 离线 RSS 阅读器预发布版本。
- 重点关注本地阅读体验、稳定性与发布流程优化。

## 提交摘要
${commitLines}

## 说明
- 如遇内容显示异常，请先清理本地缓存并重启应用后重试。
- 本说明由发布流程自动生成，仅保留版本更新关键信息。
`
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith("--")) continue
    const key = token.slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith("--")) continue
    args[key] = value
    i += 1
  }
  return args
}

function getRecentCommits(limit = MAX_COMMITS) {
  const output = execSync(`git log --pretty=%s -n ${limit}`, {
    encoding: "utf-8",
  })
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function main() {
  const args = parseArgs(process.argv)
  const version = args.version || "v0.0.0"
  const { output } = args

  if (!output) {
    console.error("Missing --output argument")
    process.exit(1)
  }

  const commits = getRecentCommits(MAX_COMMITS)
  const markdown = buildReleaseNotes(version, commits)
  writeFileSync(output, markdown, "utf-8")
  console.info(`Release notes generated: ${output}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
