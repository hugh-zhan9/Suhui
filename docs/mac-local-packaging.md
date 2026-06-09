# macOS 本地打包与安装

本文档用于在本仓库构建并安装溯洄的 macOS 本地包（推荐无签名模式）。

## 1. 前置条件

- 操作系统：macOS（Apple Silicon 或 Intel）
- Node 与包管理：`pnpm`（仓库使用 workspace）
- 执行目录：仓库根目录 `Suhui`

## 2. 安装依赖

```bash
cd "/path/to/Suhui"
pnpm install
```

## 3. 一键构建并安装（无签名）

```bash
pnpm install:macos-local
```

说明：

- 脚本会自动关闭旧应用、执行 `pnpm --filter suhui build:electron-vite` 与 `FOLO_NO_SIGN=1 node scripts/run-electron-forge.mjs package`、安装打包产出的 `.app`、重新做一次本地 ad-hoc 签名、清理 quarantine、构建并链接 `suhui` CLI，然后启动应用。
- 应用安装采用临时目录复制和签名，签名完成后再替换 `/Applications/溯洄.app`，避免安装中途失败时破坏旧版本。
- 无签名模式会设置 `FOLO_NO_SIGN=1`，用于本地验证。
- 默认安装当前机器架构；如需指定，可设置 `SUHUI_INSTALL_ARCH=arm64` 或 `SUHUI_INSTALL_ARCH=x64`。
- CLI 默认链接到 `~/.local/bin/suhui`；如需指定目录，可设置 `SUHUI_CLI_BIN_DIR=/path/to/bin`。如果目录不在 `PATH` 中，脚本会打印提示。
- Electron Forge 会统一通过 `scripts/run-electron-forge.mjs` 启动；该脚本默认启用 `ELECTRON_GET_USE_PROXY=1`，并在未显式指定镜像时默认使用 `https://npmmirror.com/mirrors/electron/` 作为 Electron 下载镜像。
- 这样可以绕开本机上偶发的 `electron-forge make` 悬挂不退出问题。

已验证说明：

- `bash scripts/install-macos-local.test.sh` 可通过。
- `bash scripts/install-macos-local.sh` 在当前仓库已验证可跑通。
- 如果本机第一次打包时报 native module 缺失，先补编再重试：

```bash
pnpm exec node-gyp rebuild --directory node_modules/macos-alias
pnpm exec node-gyp rebuild --directory node_modules/fs-xattr
pnpm install:macos-local
```

## 4. 构建产物位置

默认输出目录：

- `/tmp/suhui-forge-out/溯洄-darwin-<arch>/溯洄.app`

示例：

```bash
open /tmp/suhui-forge-out/溯洄-darwin-arm64/溯洄.app
```

## 5. 手动安装与启动（可选）

如需跳过一键脚本，也可以手动复制并做本地 ad-hoc 签名：

```bash
rm -rf /Applications/溯洄.app
ditto /tmp/suhui-forge-out/溯洄-darwin-arm64/溯洄.app /Applications/溯洄.app
codesign --force --deep --sign - /Applications/溯洄.app
xattr -dr com.apple.quarantine /Applications/溯洄.app
open /Applications/溯洄.app
```

Intel 机器请将路径中的 `arm64` 替换为 `x64`。

## 6. 注意事项

- 请从 `/Applications/溯洄.app` 启动，不要直接在 iCloud 同步目录内运行 `.app`，以降低 `Code Signature Invalid` 风险。
- 如果应用启动后立刻退出，先检查 `~/Library/Logs/溯洄/main.log` 与 `~/Library/Logs/溯洄/boot.log`。
- 刷新相关日志与排查步骤见 [local-refresh-observability.md](local-refresh-observability.md)。
- 如需签名包，可使用：

```bash
pnpm --filter suhui build:electron
```

前提是本机签名与 notarization 环境配置完整。
