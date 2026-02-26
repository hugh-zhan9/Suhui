# FreeFolo

FreeFolo 是一个 desktop-only 的本地 RSS 阅读器分支。当前仓库目标是：

- 仅保留桌面端（`apps/desktop`）
- 以本地数据为主（SQLite + IPC）
- 优先保障订阅、拉取、阅读、已读/未读等核心链路离线可用

详细上下文请先阅读 `AI-CONTEXT.md`（单一事实源）。

## 当前状态

- 应用名：`FreeFolo`
- 主要工作区：`apps/desktop`、`packages/internal/*`
- 远端能力：主阅读链路已本地化，部分非核心模块仍可能保留在线分支

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
pnpm --filter FreeFolo dev:electron

# Electron 预览（基于构建产物）
pnpm --filter FreeFolo start
```

## 打包命令

```bash
# 常规打包
pnpm --filter FreeFolo build:electron

# 无签名打包（本地验证建议）
pnpm --filter FreeFolo build:electron:unsigned
```

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

## 许可证

本项目遵循 GNU AGPL v3（含仓库中声明的额外例外条款）。
