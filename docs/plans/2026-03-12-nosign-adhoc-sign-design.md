# No-Sign 打包产物 ad-hoc 重签名设计

## 背景

当前 macOS 无签名打包产物在 `cleanSourcesOnly` 清理语言资源后，嵌套 bundle 的签名状态被破坏，Finder 启动报 `kLSNoExecutableErr`。问题不在业务代码，而在 no-sign 打包链路产出的 `.app` 本身已经损坏。

## 方案对比

1. 在 `FOLO_NO_SIGN=1` 的打包链路末尾做 ad-hoc 重签名

- 优点：保留现有瘦身逻辑，改动最小，能持续修复后续产物。
- 缺点：使用 `--deep` 只是工程止血，不是最严格的签名策略。

2. 禁用 `cleanSourcesOnly`

- 优点：实现最简单。
- 缺点：回退既有缩包收益，不符合当前目标。

3. 重写资源清理逻辑，只移除不影响签名的内容

- 优点：长期更干净。
- 缺点：复杂度高，当前不是最短路径。

## 结论

采用方案 1：仅对 `FOLO_NO_SIGN=1` 的 macOS 打包产物，在 `postPackage` 阶段执行 `codesign --force --deep --sign - <app-path>`。

## 设计

- 修改文件：`apps/desktop/forge.config.cts`
- 新增一个条件判断 helper，用于单测锁定触发条件。
- 在 `postPackage` hook 中：
  - 判断是否为 macOS + no-sign 构建
  - 对最终 `.app` 执行 ad-hoc 签名
  - 若签名失败，直接让打包失败
- 不影响正式签名、notarize、mas 路径。

## 测试

- 新增 `apps/desktop/scripts/packaging/adhoc-sign.test.ts`
- 验证 helper 在不同平台/环境变量下的返回值
- 实证验证：重新打包后执行 `codesign --verify --deep --strict`，并验证 `open -a` 可启动
