# 数据库配置可视化与日志设计

**目标**：

- 启动日志输出当前 DB 类型与 `.env` 来源路径（含候选列表）。
- 设置-通用-数据源新增只读展示，显示 DB 类型、连接信息与脱敏密码，并展示 `.env` 生效来源。
- README 补充 SQLite 默认与 Postgres 切换说明。

## 背景与约束

- 仍以 `.env` 配置切换数据库，不提供 UI 修改能力。
- `userData/.env` 优先级高于 `resources/.env`。
- 启动失败（Postgres 连接失败）仍直接报错退出。

## 方案对比

1. 只读展示（选定）：UI 仅展示配置，不可编辑。
2. 可编辑展示：写回 `.env`（与“无 UI 配置”原则冲突）。
3. 仅显示 DB_TYPE：信息不足，排障不友好。

## 设计与范围

### 启动日志

- `loadDesktopEnv` 返回：
  - `candidates`: 读取到的 `.env` 路径列表
  - `active`: 最终生效来源（最后一个加载的路径）
- `bootstrap.ts` 输出：
  - `db_type`: 解析后的数据库类型
  - `env_source`: 生效来源路径或 `none`
  - `env_candidates`: 读取到的路径列表

### UI 展示（配置-通用-数据源）

- 新增只读区块，展示：
  - 数据库类型（sqlite/postgres）
  - 连接信息（DB_CONN、DB_USER）
  - 密码脱敏（`***`）
  - `.env` 生效来源路径
- 仅展示，不允许编辑。

### README 更新

- 新增“数据库配置”章节：
  - SQLite 默认行为
  - Postgres `.env` 配置示例
  - `.env` 优先级
  - `userData` 路径（macOS/Windows/Linux）
  - `.env-example` 用途说明

## 验收

- 启动日志包含 db_type 与 env 来源路径。
- 设置-通用-数据源显示只读配置且密码脱敏。
- README 包含数据库配置说明。
