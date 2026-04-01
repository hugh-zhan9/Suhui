# Contributing to Suhui

本仓库当前是 `desktop-only`，围绕本地优先 RSS 阅读器工作流继续演进。

## 开始之前

请先阅读 [AI-CONTEXT.md](/Users/zhangyukun/project/Suhui/AI-CONTEXT.md)。

安装依赖前先启用 Corepack：

```sh
corepack enable && corepack prepare
pnpm install
```

## 常用命令

在仓库根目录执行：

```sh
pnpm --filter suhui dev:electron
pnpm --filter suhui start
pnpm --filter suhui build:electron
pnpm --filter suhui build:electron:unsigned
```

## 开发约束

- 当前主工作区是 `apps/desktop`
- 主数据面是本地 Postgres，不要把渲染层重新改回直连数据库
- 运行中的桌面应用会暴露 remote browser access，远程端与桌面端都应通过主进程协调写入
- web/remote 不应新增独立定时自动刷新逻辑；自动刷新由 app 主进程负责

## 提交流程

- 代码改动应包含必要测试
- 行为、命令、架构变化时必须同步更新文档
- 提交信息保持清晰、直接、可追踪

## 文档同步规则

- [AI-CONTEXT.md](/Users/zhangyukun/project/Suhui/AI-CONTEXT.md) 是单一事实源
- `AGENTS.md`、`GEMINI.md`、`CLAUDE.md` 仅为指针文件，不维护独立规则
- 如果以下内容发生变化，至少同步更新：
  - [README.md](/Users/zhangyukun/project/Suhui/README.md)
  - [CONTRIBUTING.md](/Users/zhangyukun/project/Suhui/CONTRIBUTING.md)
  - [AI-CONTEXT.md](/Users/zhangyukun/project/Suhui/AI-CONTEXT.md)
  - 必要时更新对应脚本 README 或 [docs/README.md](/Users/zhangyukun/project/Suhui/docs/README.md)

## 许可证

提交到本仓库的代码默认遵循 GNU AGPL v3，以及仓库内声明的额外例外条款。
