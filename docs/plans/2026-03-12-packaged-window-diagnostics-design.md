# Packaged 窗口创建链路诊断设计

## 背景

`dev` 模式正常，但打包后的 `溯洄.app` 启动后没有可见窗口。说明业务逻辑和接口链路大概率正常，问题集中在 packaged 主进程启动与窗口创建链路。

## 方案对比

1. 继续依赖现有 `main.log`

- 优点：复用现有日志。
- 缺点：当前证据不足，无法区分是窗口未创建、屏幕外、还是 renderer 加载失败。

2. 在窗口创建链路加细粒度诊断日志

- 优点：最短路径定位卡在 DB、Sync、窗口创建还是 renderer 加载。
- 缺点：需要临时增加日志噪音。

3. 直接引入 Playwright / UI 自动化观察 packaged 窗口

- 优点：可见性强。
- 缺点：环境依赖更高，当前不如日志直接。

## 结论

采用方案 2：在 packaged 主进程窗口链路加入关键事件日志，并在创建后显式 `show/focus/center`，同时记录窗口 bounds 与渲染加载事件。

## 设计

- 修改：
  - `apps/desktop/layer/main/src/manager/bootstrap.ts`
  - `apps/desktop/layer/main/src/manager/window.ts`
- 记录点：
  - `DBManager.init()` 前后
  - `SyncManager.init()` 前后
  - `WindowManager.getMainWindowOrCreate()` 前后
  - `did-finish-load`
  - `did-fail-load`
  - `ready-to-show`
  - `show`
  - `render-process-gone`
- 在 packaged 模式窗口创建后额外执行：
  - `center()`
  - `show()`
  - `focus()`
- 日志写入现有 `main.log`，必要时同时写 `boot.log`。

## 测试

- 新增针对窗口诊断 helper 的单测，避免直接测试 BrowserWindow 复杂行为。
- 主进程全量测试继续跑，确保无回归。
