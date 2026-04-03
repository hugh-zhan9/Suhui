# 文档导航

本文档用于说明哪些文档代表当前实现，哪些文档只是历史设计或计划。

## 当前有效文档

- [AI-CONTEXT.md](/Users/zhangyukun/project/Suhui/AI-CONTEXT.md)
  - 项目单一事实源，优先级最高
- [README.md](/Users/zhangyukun/project/Suhui/README.md)
  - 仓库入口、环境、命令、运行边界
- [CONTRIBUTING.md](/Users/zhangyukun/project/Suhui/CONTRIBUTING.md)
  - 贡献流程与文档同步规则
- [mac-local-packaging.md](/Users/zhangyukun/project/Suhui/docs/mac-local-packaging.md)
  - macOS 本地构建和安装
- [local-refresh-observability.md](/Users/zhangyukun/project/Suhui/docs/local-refresh-observability.md)
  - 本地刷新链路的校验方法、日志位置与排查步骤
- [README.repair-published-at.md](/Users/zhangyukun/project/Suhui/apps/desktop/scripts/README.repair-published-at.md)
  - 历史 `publishedAt` 脏数据诊断与修复脚本说明
- [AI_CHANGELOG.md](/Users/zhangyukun/project/Suhui/docs/AI_CHANGELOG.md)
  - 近期代码改动记录

## 当前代码结论

截至 2026-04-01，仓库真实状态是：

- `desktop-only`
- 主数据面为本地 Postgres
- RSSHub 为外部实例模式，不再以内嵌运行时作为当前实现基线
- 运行中的桌面应用内含远程浏览器访问入口

## 历史设计文档

以下文档保留用于演进记录、历史决策对照或实现参考，不应当被视为“当前行为说明”：

- `docs/rsshub-embedded-design.md`
- `docs/rsshub-embedded-design-v2.md`
- `docs/rsshub-technical-design.md`
- `docs/rsshub-dev-plan.md`
- `docs/sync-design.md`
- `docs/sync-technical-design.md`
- `docs/sync-dev-plan.md`
- `docs/plans/*.md`
- `docs/superpowers/specs/*.md`

使用这些文档时，应以代码和 [AI-CONTEXT.md](/Users/zhangyukun/project/Suhui/AI-CONTEXT.md) 交叉核对。
