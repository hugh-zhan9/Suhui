# macOS 本地打包与安装

本文档用于在本仓库构建并安装溯洄的 macOS 本地包（推荐无签名模式）。

## 1. 前置条件

- 操作系统：macOS（Apple Silicon）
- Node 与包管理：`pnpm`（仓库使用 workspace）
- 执行目录：仓库根目录 `Suhui`

## 2. 安装依赖

```bash
cd "/Users/zhangyukun/project/Suhui"
pnpm install
```

## 3. 一键构建并安装（无签名）

```bash
pnpm install:macos-local
```

说明：

- 脚本会自动关闭旧应用、执行 `pnpm --filter suhui build:electron:unsigned`、挂载最新 DMG、覆盖 `/Applications/溯洄.app`、清理 quarantine，并直接启动应用。
- 无签名模式会设置 `FOLO_NO_SIGN=1`，用于本地验证。

## 4. 构建产物位置

默认输出目录：

- `/tmp/suhui-forge-out/make/溯洄-<version>-macos-arm64.dmg`
- `/tmp/suhui-forge-out/make/zip/darwin/arm64/溯洄-<version>-macos-arm64.zip`

示例：

```bash
open /tmp/suhui-forge-out/make/溯洄-1.3.1-macos-arm64.dmg
```

## 5. 手动安装与启动（可选）

1. 打开 DMG 并安装。
2. 将 `溯洄.app` 拖入 `Applications`。
3. 首次启动若被拦截，执行：

```bash
xattr -dr com.apple.quarantine /Applications/溯洄.app
open /Applications/溯洄.app
```

## 6. 注意事项

- 请从 `/Applications/溯洄.app` 启动，不要直接在 iCloud 同步目录内运行 `.app`，以降低 `Code Signature Invalid` 风险。
- 如需签名包，可使用：

```bash
pnpm --filter suhui build:electron
```

前提是本机签名与 notarization 环境配置完整。
