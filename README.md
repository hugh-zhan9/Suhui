# 溯洄（Suhui）

溯洄是一个 `desktop-only`、本地优先的 RSS 阅读器仓库。

当前代码基线：

- 仅保留桌面端：`apps/desktop`
- 主数据面是本地 Postgres
- 渲染层通过 IPC 访问主进程
- 运行中的桌面应用会在主进程内启动远程浏览器访问入口

项目上下文以 [AI-CONTEXT.md](/Users/zhangyukun/project/Suhui/AI-CONTEXT.md) 为单一事实源。

## 当前能力

- 本地订阅、拉取、刷新、阅读
- 已读/未读状态与未读计数
- 启动后自动刷新本地订阅：
  - 启动 5 秒后执行一次
  - 之后每 30 分钟执行一次
- 远程浏览器访问：
  - 默认监听 `0.0.0.0:41595`
  - 提供 `/health`、`/status`、`/events`
  - 提供订阅、条目、未读、读状态、单 feed 刷新、全量刷新接口

## 目录

- `apps/desktop/layer/main`
  - Electron 主进程、数据库、远程服务、自动刷新
- `apps/desktop/layer/renderer`
  - 桌面渲染层 UI 与 remote browser entry
- `packages/internal/store`
  - 共享状态管理与查询逻辑
- `packages/internal/database`
  - schema 与数据库访问层
- `docs/`
  - 当前说明、历史设计、演进记录

## 环境要求

- Node.js：建议使用仓库 `.nvmrc` 对应版本
- Corepack
- pnpm
- 本地 Postgres

安装依赖：

```bash
corepack enable
corepack prepare
pnpm install
```

## 数据库配置

桌面端默认使用 Postgres。

示例配置：

```env
DB_CONN=127.0.0.1:5432/suhui
DB_USER=postgres
DB_PASSWORD=your_password
```

说明：

- 根目录有 [.env-example](/Users/zhangyukun/project/Suhui/.env-example)
- 应用会读取 `resources/.env` 与 `userData/.env`
- 如果目标数据库不存在，应用启动时会自动创建

## 开发命令

在仓库根目录执行：

```bash
pnpm --filter suhui dev:electron
pnpm --filter suhui start
pnpm --filter suhui build:electron
pnpm --filter suhui build:electron:unsigned
```

## macOS 本地安装

一键构建并安装：

```bash
pnpm install:macos-local
```

默认产物目录：

- `/tmp/suhui-forge-out/make`

更多见 [mac-local-packaging.md](/Users/zhangyukun/project/Suhui/docs/mac-local-packaging.md)。
刷新链路校验与日志位置见 [local-refresh-observability.md](/Users/zhangyukun/project/Suhui/docs/local-refresh-observability.md)。

## PostgreSQL Docker（可选）

仓库提供 [docker-compose.yaml](/Users/zhangyukun/project/Suhui/docker-compose.yaml)：

```bash
docker compose up -d
```

## 外部 RSSHub（可选）

当前代码不再内嵌 RSSHub 运行时。

RSSHub 相关行为：

- `rsshub.app` 和 `rsshub://` 形式会被识别为 RSSHub 路由
- 必须配置外部 RSSHub 实例，或显式允许回退到官方 `https://rsshub.app`
- 未配置时会抛出 `RSSHUB_EXTERNAL_UNCONFIGURED`

仓库仍提供本地开发用 [docker-compose.rsshub.yaml](/Users/zhangyukun/project/Suhui/docker-compose.rsshub.yaml)：

```bash
docker compose -f docker-compose.rsshub.yaml up -d
```

如果你在应用里配置外部 RSSHub，可填：

```text
http://localhost:1200
```

## 历史 SQLite 数据迁移

如果你有更早版本的 SQLite 数据，可手动迁移：

```bash
pnpm exec tsx scripts/migrate-sqlite-to-postgres.ts
```

## 历史脏数据修复脚本

如果文章 `publishedAt` 曾被错误写成抓取时间，可使用：

- [repair-published-at.ts](/Users/zhangyukun/project/Suhui/apps/desktop/scripts/repair-published-at.ts)
- [README.repair-published-at.md](/Users/zhangyukun/project/Suhui/apps/desktop/scripts/README.repair-published-at.md)

建议先跑 `report`，确认样本后再 `apply`。

## 文档导航

- [AI-CONTEXT.md](/Users/zhangyukun/project/Suhui/AI-CONTEXT.md)
  - 当前项目单一事实源
- [docs/README.md](/Users/zhangyukun/project/Suhui/docs/README.md)
  - 当前文档导航与历史文档说明
- [docs/mac-local-packaging.md](/Users/zhangyukun/project/Suhui/docs/mac-local-packaging.md)
  - macOS 本地构建与安装
- [docs/AI_CHANGELOG.md](/Users/zhangyukun/project/Suhui/docs/AI_CHANGELOG.md)
  - 代码变更记录

## 文档规则

- `AI-CONTEXT.md` 是单一事实源
- `AGENTS.md`、`GEMINI.md`、`CLAUDE.md` 仅作为指针文件
- 行为、命令、架构发生变化时，至少同步更新：
  - `README.md`
  - `CONTRIBUTING.md`
  - `AI-CONTEXT.md`

## 许可证

本项目遵循 GNU AGPL v3（含仓库中声明的额外例外条款）。
