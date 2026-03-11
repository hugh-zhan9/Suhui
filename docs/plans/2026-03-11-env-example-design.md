# Postgres 环境示例文件设计

**目标**：在仓库根目录新增 `.env-example`，提供仅包含 Postgres 的完整示例配置，方便用户复制到 `userData/.env` 使用。

## 背景与约束

- 需求明确要求仅放 Postgres 示例。
- 当前运行时只会读取 `resources/.env` 与 `userData/.env`，根目录 `.env-example` 不会被加载。

## 方案对比

1. 根目录新增 `.env-example`（选定）：最符合通用约定、用户易发现。
2. `apps/desktop/resources/.env-example`：不易发现且容易误解为运行时加载。
3. `docs/`：不符合“示例保存在 .env-example 中”的要求。

## 设计与范围

- 新增文件：`/.env-example`
- 内容仅包含 Postgres 相关变量：`DB_TYPE`、`DB_CONN`、`DB_USER`、`DB_PASSWORD`

## 验收

- 根目录存在 `.env-example`
- 内容为 Postgres 完整示例
