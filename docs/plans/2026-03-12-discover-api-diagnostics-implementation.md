# Discover API Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Discover/Trending 独立 API 客户端增加临时诊断日志，定位失败发生在请求、响应还是解析阶段。

**Architecture:** 在 renderer 的 `discoverClient` 上挂载专用拦截器，输出请求前、响应后和错误时的结构化日志。日志只作用于 Discover/Trending，不影响主链路。通过最小单测约束诊断拦截器被注册。

**Tech Stack:** TypeScript, Axios, Vitest, Electron renderer

---

### Task 1: 为 discoverClient 写失败前置测试

**Files:**

- Modify: `apps/desktop/layer/renderer/src/lib/discover-client.test.ts`
- Test: `apps/desktop/layer/renderer/src/lib/discover-client.test.ts`

**Step 1: 写失败测试**

- 新增对 discover client 诊断注册函数/标记的断言。

**Step 2: 运行测试确认失败**

- Run: `pnpm --filter @suhui/renderer test --run src/lib/discover-client.test.ts`
- Expected: 断言失败，提示缺少诊断导出或标记。

**Step 3: 最小实现让测试通过**

- 在 `api-client.ts` 导出 discover 诊断辅助方法或标记。

**Step 4: 再跑测试确认通过**

- Run: `pnpm --filter @suhui/renderer test --run src/lib/discover-client.test.ts`
- Expected: PASS

### Task 2: 增加 discover API 临时诊断日志

**Files:**

- Modify: `apps/desktop/layer/renderer/src/lib/api-client.ts`

**Step 1: 实现请求前日志**

- 记录 `baseURL`、拼接后的 URL、`method`、`params`、`data`。

**Step 2: 实现响应后日志**

- 记录 `status`、`content-type`、最终 URL、响应体预览。

**Step 3: 实现错误日志**

- 记录 Axios error 的 `code/message/status`，以及 `response.data` 预览。

**Step 4: 控制日志范围**

- 日志前缀固定为 `[Discover API]`，仅挂在 `discoverClient`。

### Task 3: 验证与记录

**Files:**

- Modify: `docs/AI_CHANGELOG.md`

**Step 1: 跑定向测试**

- Run: `pnpm --filter @suhui/renderer test --run src/lib/discover-client.test.ts`

**Step 2: 跑 renderer 全量测试**

- Run: `pnpm --filter @suhui/renderer test`

**Step 3: 记录 flight-recorder**

- Run: `python3 /Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py ...`

**Step 4: 重新打包并替换应用（如果你确认需要）**

- Run: `pnpm --filter suhui exec electron-forge package`
- 然后覆盖 `/Applications/溯洄.app`
