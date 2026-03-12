# Packaged 启动早期诊断设计

## 背景

打包后的 `溯洄.app` 启动时疑似卡死，但现有 `~/Library/Logs/溯洄/main.log` 没有新的启动记录，说明问题可能发生在 `electron-log` 正常工作之前。

## 方案对比

1. 只继续依赖 `electron-log`

- 优点：复用现有日志体系。
- 缺点：当前已经证明在故障场景下拿不到早期证据。

2. 使用独立 `boot.log` 同步写盘

- 优点：不依赖 `logger` 初始化，能覆盖 `bootstrap.ts` 到 `app.whenReady()` 之间的阶段。
- 缺点：需要额外清理临时诊断代码。

3. 只用系统日志

- 优点：不改代码。
- 缺点：当前沙箱环境无法稳定读取，且用户本地排障不方便。

## 结论

采用方案 2：新增独立 `boot.log`，记录打包版启动关键检查点。仅对主进程生效，不影响渲染层。

## 设计

- 新增 `apps/desktop/layer/main/src/manager/boot-log.ts`
- 输出文件：`~/Library/Logs/溯洄/boot.log`
- 记录点：
  - `bootstrap:loaded`
  - `bootstrap:env-loaded`
  - `bootstrap:manager-imported`
  - `manager:start`
  - `manager:db-ready`
  - `manager:sync-ready`
  - `manager:app-init`
  - `manager:single-instance-ok`
  - `manager:when-ready`
  - `manager:window-created`
- 日志格式：单行文本，包含 ISO 时间、阶段名、可选 JSON 元数据。
- 若写 boot.log 失败，只吞掉异常，避免再次阻断启动。

## 测试

- 为 `boot-log.ts` 增加单测，先验证写盘格式和追加行为。
- 主进程相关测试继续跑全量，防止引入启动回归。
