# macOS 本地打包与安装

本文档用于在本仓库构建并安装 FreeFolo 的 macOS 本地包（推荐无签名模式）。

## 1. 前置条件

- 操作系统：macOS（Apple Silicon）
- Node 与包管理：`pnpm`（仓库使用 workspace）
- 执行目录：仓库根目录 `FreeFoloRss`

## 2. 安装依赖

```bash
cd "/Users/zhangyukun/Library/Mobile Documents/com~apple~CloudDocs/scripts/FreeFoloRss"
pnpm install
```

## 3. 构建本地安装包（无签名）

```bash
pnpm --filter FreeFolo build:electron:unsigned
```

说明：无签名模式会设置 `FOLO_NO_SIGN=1`，用于本地验证，避免签名链路导致的构建/启动阻断。

## 4. 构建产物位置

默认输出目录：

- `/tmp/folo-forge-out/make/Folo-1.3.1-macos-arm64.dmg`
- `/tmp/folo-forge-out/make/latest-mac.yml`

## 5. 安装与启动

1. 打开 DMG：

```bash
open /tmp/folo-forge-out/make/Folo-1.3.1-macos-arm64.dmg
```

2. 将 `Folo.app` 拖入 `Applications`。
3. 首次启动若被拦截，执行：

```bash
xattr -dr com.apple.quarantine /Applications/Folo.app
open /Applications/Folo.app
```

## 6. 注意事项

- 请从 `/Applications/Folo.app` 启动，不要直接在 iCloud 同步目录内运行 `.app`，以降低 `Code Signature Invalid` 风险。
- 如需签名包，可使用：

```bash
pnpm --filter FreeFolo build:electron
```

前提是本机签名与 notarization 环境配置完整。
