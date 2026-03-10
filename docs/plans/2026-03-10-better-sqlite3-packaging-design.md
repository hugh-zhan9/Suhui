# better-sqlite3 打包修复设计

**目标**

- 修复 macOS 打包产物缺失 `better_sqlite3.node` 导致应用白屏的问题。
- 仅改动打包流程，不调整运行时代码、不新增 fail-fast 检查。

**范围**

- 仅调整 `apps/desktop/forge.config.cts` 的打包复制逻辑。
- 产物验证仅通过重新打包与解包检查，避免引入新的运行时代码路径。

**背景与根因**

- 运行应用时主进程报错：`Could not locate the bindings file`。
- 打包 zip 中缺少 `app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node`。
- `better-sqlite3` 为原生模块，必须在打包阶段进入 `app.asar.unpacked` 才能被运行时加载。

**方案对比**

- 方案 A（推荐）：在 `afterCopy` 阶段把 `better_sqlite3.node` 复制到 buildPath 的 `node_modules/better-sqlite3/build/Release/`，确保 asar 打包能识别并解包。
- 方案 B：作为 `extraResource` 拷贝并改运行时加载路径（侵入更大）。
- 方案 C：整个模块放入 `app.asar.unpacked`（包体变大且路径处理复杂）。

**设计决策**

- 采用方案 A，最小改动且对运行时无侵入。
- 只在 darwin 产物执行（与现有 `postPackage` 行为一致）。

**实现要点**

- 定位源文件：`resolveRetainedModuleSource("better-sqlite3")/build/Release/better_sqlite3.node`。
- 目标路径：`<buildPath>/node_modules/better-sqlite3/build/Release/better_sqlite3.node`。
- 复制发生在 `afterCopy` 阶段，确保 asar 扫描到该 `.node` 文件并进入 `app.asar.unpacked`。

**测试策略**

- 重新执行 `pnpm --filter suhui build:electron:unsigned`。
- 检查生成 zip 包内是否包含：
  - `app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
- 安装并启动应用，确认不再白屏。
