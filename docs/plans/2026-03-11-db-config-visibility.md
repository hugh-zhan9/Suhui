# DB Config Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 启动日志输出 DB 类型与 `.env` 来源；设置-通用-数据源显示只读 DB 配置；README 补充配置说明。

**Architecture:**

- 主进程 `env-loader` 返回加载结果并提供 getter。
- `AppService` 暴露 `getDbConfig` 供渲染层查询。
- 渲染层在“配置-通用-数据源”只读展示 DB 配置，并对密码脱敏。
- README 补充配置使用说明。

**Tech Stack:** TypeScript, React, Electron IPC, Vitest

---

### Task 1: 为 env-loader 新能力补充失败测试

**Files:**

- Modify: `apps/desktop/layer/main/src/manager/env-loader.test.ts`

**Step 1: Write the failing test**

```ts
import fs from "node:fs"
import os from "node:os"

import { join } from "pathe"
import { describe, expect, it } from "vitest"

import { loadDesktopEnv, resolveEnvPaths } from "./env-loader"

describe("env-loader", () => {
  it("loads resources before userData for override order", () => {
    const paths = resolveEnvPaths({
      userDataPath: "/user",
      resourcesPath: "/res",
    })
    expect(paths).toEqual(["/res/.env", "/user/.env"])
  })

  it("returns active env source and candidates", () => {
    const tmp = fs.mkdtempSync(join(os.tmpdir(), "folo-env-"))
    const resourcesPath = join(tmp, "res")
    const userDataPath = join(tmp, "user")
    fs.mkdirSync(resourcesPath, { recursive: true })
    fs.mkdirSync(userDataPath, { recursive: true })

    const resEnv = join(resourcesPath, ".env")
    const userEnv = join(userDataPath, ".env")

    fs.writeFileSync(resEnv, "DB_TYPE=sqlite\n")
    fs.writeFileSync(userEnv, "DB_TYPE=postgres\n")

    const originalEnv = { ...process.env }
    try {
      const result = loadDesktopEnv({ userDataPath, resourcesPath })
      expect(result.candidates).toEqual([resEnv, userEnv])
      expect(result.active).toBe(userEnv)
    } finally {
      process.env = originalEnv
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts apps/desktop/layer/main/src/manager/env-loader.test.ts
```

Expected: FAIL（`loadDesktopEnv` 尚未返回候选与 active）。

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/env-loader.test.ts

git commit -m "test: cover env loader info"
```

---

### Task 2: 为 DB 配置视图构建函数补充失败测试

**Files:**

- Create: `apps/desktop/layer/main/src/manager/db-config-view.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"

import type { EnvLoadInfo } from "./env-loader"
import { buildDbConfigView } from "./db-config-view"

describe("buildDbConfigView", () => {
  it("masks password and exposes env source", () => {
    const envInfo: EnvLoadInfo = {
      candidates: ["/res/.env", "/user/.env"],
      active: "/user/.env",
    }

    const result = buildDbConfigView({
      env: {
        DB_TYPE: "postgres",
        DB_CONN: "127.0.0.1:5432/suhui",
        DB_USER: "postgres",
        DB_PASSWORD: "secret",
      },
      envInfo,
    })

    expect(result).toEqual({
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/suhui",
      dbUser: "postgres",
      dbPasswordMasked: "***",
      envSource: "/user/.env",
      envCandidates: ["/res/.env", "/user/.env"],
    })
  })

  it("defaults to sqlite when missing DB_TYPE", () => {
    const result = buildDbConfigView({
      env: {},
      envInfo: { candidates: [], active: undefined },
    })

    expect(result.dbType).toBe("sqlite")
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts apps/desktop/layer/main/src/manager/db-config-view.test.ts
```

Expected: FAIL（函数尚不存在）。

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/db-config-view.test.ts

git commit -m "test: add db config view builder"
```

---

### Task 3: 为渲染层展示格式化补充失败测试

**Files:**

- Create: `apps/desktop/layer/renderer/src/modules/settings/utils/db-config-display.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"

import { formatDisplayValue, formatDisplayList } from "./db-config-display"

describe("db config display", () => {
  it("formats empty values with fallback", () => {
    expect(formatDisplayValue("", "N/A")).toBe("N/A")
    expect(formatDisplayValue(undefined, "N/A")).toBe("N/A")
  })

  it("formats list values with fallback", () => {
    expect(formatDisplayList([], "none")).toBe("none")
    expect(formatDisplayList(["a", "b"], "none")).toBe("a, b")
  })
})
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run -c apps/desktop/layer/renderer/vitest.config.ts apps/desktop/layer/renderer/src/modules/settings/utils/db-config-display.test.ts
```

Expected: FAIL（函数尚不存在）。

**Step 3: Commit**

```bash
git add apps/desktop/layer/renderer/src/modules/settings/utils/db-config-display.test.ts

git commit -m "test: add db config display helpers"
```

---

### Task 4: 实现主进程 env 与 DB 配置输出

**Files:**

- Modify: `apps/desktop/layer/main/src/manager/env-loader.ts`
- Modify: `apps/desktop/layer/main/src/bootstrap.ts`
- Create: `apps/desktop/layer/main/src/manager/db-config-view.ts`
- Modify: `apps/desktop/layer/main/src/ipc/services/app.ts`

**Step 1: Implement minimal code**

- `loadDesktopEnv` 返回 `{ candidates, active }`，并提供 `getDesktopEnvInfo` 读取最后一次加载结果。
- `bootstrap.ts` 输出日志：`db_type`、`env_source`、`env_candidates`。
- `buildDbConfigView` 通过 `resolveDbType` 生成 `dbType`，并脱敏密码。
- `AppService.getDbConfig()` 通过 `buildDbConfigView` 返回配置。

**Step 2: Run tests**

```bash
pnpm exec vitest run -c apps/desktop/layer/main/vitest.config.ts \
  apps/desktop/layer/main/src/manager/env-loader.test.ts \
  apps/desktop/layer/main/src/manager/db-config-view.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/layer/main/src/manager/env-loader.ts \
  apps/desktop/layer/main/src/bootstrap.ts \
  apps/desktop/layer/main/src/manager/db-config-view.ts \
  apps/desktop/layer/main/src/ipc/services/app.ts

git commit -m "feat: expose db config and env source"
```

---

### Task 5: 实现渲染层展示（配置-通用-数据源）

**Files:**

- Create: `apps/desktop/layer/renderer/src/modules/settings/utils/db-config-display.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/settings/tabs/general.tsx`
- Modify: `locales/settings/en.json`
- Modify: `locales/settings/zh-CN.json`
- Modify: `locales/settings/zh-TW.json`
- Modify: `locales/settings/ja.json`
- Modify: `locales/settings/fr-FR.json`

**Step 1: Implement minimal code**

- 新增 `formatDisplayValue` 与 `formatDisplayList`。
- 在“配置-通用-数据源”新增只读区块，使用 IPC `getDbConfig` 获取数据，脱敏展示。
- 新增对应 i18n 文案。

**Step 2: Run tests**

```bash
pnpm exec vitest run -c apps/desktop/layer/renderer/vitest.config.ts \
  apps/desktop/layer/renderer/src/modules/settings/utils/db-config-display.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/layer/renderer/src/modules/settings/utils/db-config-display.ts \
  apps/desktop/layer/renderer/src/modules/settings/tabs/general.tsx \
  locales/settings/en.json \
  locales/settings/zh-CN.json \
  locales/settings/zh-TW.json \
  locales/settings/ja.json \
  locales/settings/fr-FR.json

git commit -m "feat: show db config in settings"
```

---

### Task 6: README 补充数据库配置说明

**Files:**

- Modify: `README.md`

**Step 1: Update README**

- 增加“数据库配置”章节，包含 SQLite 默认、Postgres `.env` 示例、优先级与 `userData` 路径。

**Step 2: Commit**

```bash
git add README.md

git commit -m "docs: add db config instructions"
```
