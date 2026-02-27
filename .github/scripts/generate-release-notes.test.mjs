import assert from "node:assert/strict"
import test from "node:test"

import { buildReleaseNotes, normalizeCommits } from "./generate-release-notes.mjs"

test("normalizeCommits 应过滤 release/thanks/contributors/merge", () => {
  const input = [
    "feat: add local rss parser",
    "release(desktop): Release FreeFolo-v0.0.1",
    "Merge pull request #1 from foo/bar",
    "Thanks to all contributors",
    "Contributors: @foo @bar",
    "fix: local db mark-read",
  ]

  const output = normalizeCommits(input)
  assert.deepEqual(output, ["feat: add local rss parser", "fix: local db mark-read"])
})

test("buildReleaseNotes 生成中文模板且不包含 Thanks/Contributors 区块", () => {
  const markdown = buildReleaseNotes("FreeFolo-v0.0.1", [
    "feat: local-first rss flow",
    "fix: unread filter refresh",
  ])

  assert.match(markdown, /# FreeFolo FreeFolo-v0\.0\.1 发布说明/)
  assert.match(markdown, /## 本次更新/)
  assert.match(markdown, /## 提交摘要/)
  assert.ok(!/##\s*Thanks/i.test(markdown))
  assert.ok(!/##\s*Contributors?/i.test(markdown))
})
