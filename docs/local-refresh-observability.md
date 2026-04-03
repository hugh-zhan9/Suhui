# 本地刷新校验与日志

本文档记录当前桌面端本地刷新链路的校验方法、日志位置以及实际排查结论。

## 1. 这次实际怎么校验

截至 2026-04-03，已经执行过以下校验：

- 构建校验：

```bash
pnpm --filter suhui build:electron-vite
```

结果：通过。

- 刷新链路相关测试：

```bash
pnpm exec vitest run \
  apps/desktop/layer/main/src/manager/refresh-audit-log.test.ts \
  apps/desktop/layer/main/src/manager/local-feed-refresh-events.test.ts \
  apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.test.ts \
  apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts
```

结果：`4` 个测试文件、`16` 个测试全部通过。

- 安装脚本自测：

```bash
bash scripts/install-macos-local.test.sh
```

结果：通过。

- 真实安装脚本验证：

```bash
bash scripts/install-macos-local.sh
```

第一次失败在 DMG 生成阶段，缺少：

- `node_modules/macos-alias/build/Release/volume.node`
- `node_modules/fs-xattr/build/Release/xattr.node`

补编命令：

```bash
pnpm exec node-gyp rebuild --directory node_modules/macos-alias
pnpm exec node-gyp rebuild --directory node_modules/fs-xattr
```

补编后再次执行 `bash scripts/install-macos-local.sh`，脚本完整通过，产物生成并安装到：

```text
/Applications/溯洄.app
```

当前这次启动的日志里还能看到本机 Postgres 未启动导致的错误：

```text
connect ECONNREFUSED 127.0.0.1:5432
```

因此本机这次没有产出 `refresh.log`，原因不是刷新日志逻辑失效，而是应用在数据库不可用时没有真正进入可刷新状态。

## 2. 刷新日志保存在哪里

macOS 下日志根目录使用 Electron 的 `app.getPath("logs")`。当前应用名为 `溯洄`，因此实际目录是：

```text
~/Library/Logs/溯洄/
```

当前有三类关键日志：

- `main.log`
  - 主进程常规日志，基于 `electron-log`
  - 代码入口：`apps/desktop/layer/main/src/logger.ts`
- `boot.log`
  - 启动早期诊断日志
  - 代码入口：`apps/desktop/layer/main/src/bootstrap.ts`
  - 记录如 `bootstrap:loaded`、`manager:db-ready`、`manager:window-created`
- `refresh.log`
  - 批量刷新审计日志，格式为 NDJSON，每行一条 JSON
  - 代码入口：`apps/desktop/layer/main/src/manager/refresh-audit-log.ts`
  - 只在第一次发生批量刷新相关事件后创建

## 3. refresh.log 记录什么

当前 `refresh.log` 只覆盖批量刷新来源：

- `manual-batch`
- `startup-auto`
- `interval-auto`

当前可见阶段：

- `batch.start`
- `batch.no_subscriptions`
- `batch.feed_failed`
- `batch.completed`
- `runner.skipped`
- `runner.failed`

常见字段：

- `ts`
- `level`
- `stage`
- `source`
- `traceId`
- `batchTraceId`
- `feedId`
- `feedUrl`
- `refreshed`
- `failed`
- `reason`

## 4. 现场排查命令

查看主日志：

```bash
tail -f ~/Library/Logs/溯洄/main.log
```

查看启动日志：

```bash
tail -f ~/Library/Logs/溯洄/boot.log
```

查看刷新审计日志：

```bash
tail -f ~/Library/Logs/溯洄/refresh.log
```

如果 `refresh.log` 不存在，可以先看：

```bash
tail -n 50 ~/Library/Logs/溯洄/main.log
tail -n 50 ~/Library/Logs/溯洄/boot.log
```

优先确认：

- 应用是否真的启动成功
- 数据库是否已连通
- 是否已经触发过一次 `manual-batch`、`startup-auto` 或 `interval-auto`

## 5. 手动验证刷新是否真的在跑

建议按这个顺序验证：

1. 先确保本地 Postgres 正常可连。
2. 启动桌面端，确认 `boot.log` 里出现 `manager:db-ready`。
3. 在未选中单个订阅的情况下点击全局刷新。
4. 观察 UI 是否更新，同时看 `refresh.log` 是否出现 `manual-batch -> batch.start / batch.completed`。
5. 保持应用运行至少 5 秒，观察是否出现 `startup-auto`。
6. 长期开着应用，观察后续是否出现 `interval-auto`。

如果单 feed 刷新能更新，但全局刷新或自动刷新后 UI 不更新，优先检查：

- `refresh.log` 是否显示这一轮批量刷新成功
- `main.log` 是否有 renderer 同步错误
- 当前数据库是否在刷新时异常

## 6. 安装脚本补充说明

安装脚本入口：

```bash
pnpm install:macos-local
```

脚本实际做的事情：

- 关闭旧应用
- 执行 `pnpm --filter suhui build:electron:unsigned`
- 找到最新 DMG
- 挂载 DMG
- 覆盖安装 `/Applications/溯洄.app`
- 去除 quarantine
- 启动应用

如果卡在 DMG 阶段并出现 native module 缺失，可先尝试：

```bash
pnpm exec node-gyp rebuild --directory node_modules/macos-alias
pnpm exec node-gyp rebuild --directory node_modules/fs-xattr
pnpm install:macos-local
```
