# 溯洄（Suhui）

溯洄是一个 desktop-only 的本地 RSS 阅读器分支。当前仓库目标是：

- 仅保留桌面端（`apps/desktop`）
- 以本地数据为主（Postgres + IPC）
- 优先保障订阅、拉取、阅读、已读/未读等核心链路离线可用

详细上下文请先阅读 `AI-CONTEXT.md`（单一事实源）。

## 当前状态

- 应用名：`溯洄`
- 主要工作区：`apps/desktop`、`packages/internal/*`
- 远端能力：主阅读链路已本地化，部分非核心模块仍可能保留在线分支

## 数据库配置

- 默认使用 Postgres（本地通过 IPC 访问）
- 在 `userData/.env` 配置连接信息（修改后需重启应用）

示例（同时见仓库根目录 `.env-example`）：

```env
DB_CONN=127.0.0.1:5432/suhui
DB_USER=postgres
DB_PASSWORD=your_password
```

说明：

- `DB_CONN` 支持 `host:port/dbname` 或完整 DSN（包含 `://`）
- `.env` 优先级：`resources/.env` → `userData/.env`（后者覆盖前者）
- Postgres 模式下如果目标库不存在，应用启动时会自动创建

## 历史 SQLite 数据迁移（手动）

如果你之前使用过 SQLite，本版本不再自动迁移，请手动执行脚本：

```bash
pnpm tsx scripts/migrate-sqlite-to-postgres.ts
```

说明：

- 脚本默认读取旧 SQLite 默认路径（见下方 `userData` 路径）
- 如需覆盖路径或 Postgres 连接串：

```bash
pnpm tsx scripts/migrate-sqlite-to-postgres.ts --sqlite-path /path/to/old.db --postgres-url postgres://user:pass@localhost:5432/suhui
```

`userData` 路径（应用名：`溯洄`）：

- macOS：`~/Library/Application Support/溯洄`
- Windows：`%APPDATA%\\溯洄`
- Linux：`~/.config/溯洄`

## Docker 安装 PostgreSQL（可选）

仓库内提供 `docker-compose.yaml`（PostgreSQL 18，数据目录挂载到 `/var/lib/postgresql`，适配 18+ 目录结构）。

```bash
docker compose up -d
```

注意：

- 请修改 `docker-compose.yaml` 中的 `POSTGRES_PASSWORD`
- 默认库为 `postgres`，应用会在启动时自动创建 `suhui` 库

## Docker 部署 RSSHub（可选）

仓库根目录提供 `docker-compose.rsshub.yaml`，默认使用 `diygod/rsshub:latest` 与 `redis:7-alpine`。

启动：

```bash
docker compose -f docker-compose.rsshub.yaml up -d
```

默认访问地址：

- RSSHub：`http://localhost:1200`
- Redis：`127.0.0.1:6379`

在溯洄中，将外部 RSSHub 地址配置为：

```text
http://localhost:1200
```

说明：

- Redis 端口已映射到宿主机，可供其他本地服务复用
- 当前 Redis 默认无密码，仅适合本机开发或单用户环境，不建议直接用于公网或多人共享主机
- 如需修改端口，可在启动前覆盖环境变量：`RSSHUB_PORT`、`REDIS_PORT`
- 如需调整缓存时间，可覆盖 `CACHE_EXPIRE`
- 如需为 RSSHub 增加访问密钥，可覆盖 `RSSHUB_ACCESS_KEY`

两种 RSSHub 镜像方案：

- 默认：`diygod/rsshub:latest`
  - 更轻，拉取更快，适合大多数常规路由
- 备用：`diygod/rsshub:chromium-bundled`
  - 兼容需要浏览器渲染的动态站点路由，但镜像更大、启动更慢、占用更高

切换到备用方案示例：

```bash
RSSHUB_IMAGE=diygod/rsshub:chromium-bundled docker compose -f docker-compose.rsshub.yaml up -d
```

## 环境要求

- Node.js（建议使用仓库 `.nvmrc` 对应版本）
- Corepack + pnpm

```bash
corepack enable
corepack prepare
pnpm install
```

## 开发命令

在仓库根目录执行：

```bash
# Electron 开发
pnpm --filter suhui dev:electron

# Electron 预览（基于构建产物）
pnpm --filter suhui start
```

## 打包命令

```bash
# 常规打包
pnpm --filter suhui build:electron

# 无签名打包（本地验证建议）
pnpm --filter suhui build:electron:unsigned
```

无签名构建默认产物目录：

- `/tmp/folo-forge-out/make`
- 示例：`/tmp/folo-forge-out/make/溯洄-1.3.1-macos-arm64.dmg`

## 目录速览

- `apps/desktop/layer/main`: Electron 主进程（IPC、数据库、RSS 抓取/刷新）
- `apps/desktop/layer/renderer`: 渲染层 UI（订阅流、列表、详情、设置）
- `packages/internal/store`: 状态管理与查询
- `packages/internal/database`: 数据访问与 schema
- `issue.md`: 当前问题清单与修复记录
- `docs/AI_CHANGELOG.md`: 变更记录（flight-recorder）

## 文档同步规则

- 上下文文档以 `AI-CONTEXT.md` 为准
- `AGENTS.md` / `GEMINI.md` / `CLAUDE.md` 仅做指针，不维护独立规则
- 命令、架构、端支持发生变化时，需同步更新 `README.md` 与 `CONTRIBUTING.md`

## 相关文档

- `AI-CONTEXT.md`：项目单一事实源（必须优先阅读）
- `docs/mac-local-packaging.md`：macOS 本地打包与安装流程
- `docs/rsshub-technical-design.md`：内嵌 RSSHub 技术方案
- `docs/rsshub-dev-plan.md`：内嵌 RSSHub 开发计划与里程碑状态

## 许可证

本项目遵循 GNU AGPL v3（含仓库中声明的额外例外条款）。
