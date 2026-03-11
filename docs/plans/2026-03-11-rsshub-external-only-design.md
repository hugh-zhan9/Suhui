# RSSHub External-Only 设计稿

> 日期：2026-03-11
> 目标：彻底移除内置 RSSHub 运行时，改为外部 RSSHub 实例驱动

## 1. 背景与动机

- 内置 RSSHub 运行时增加包体、构建复杂度与跨平台运行时风险。
- 现有架构已经支持外部 RSSHub（`rsshubCustomUrl`），具备切换基础。
- 业务决定：不再维护内置 RSSHub，统一依赖外部部署。

## 2. 目标与非目标

**目标**

- 移除内置 RSSHub 运行时与 Lite/Official 模式。
- 保留 `rsshub://...` 与 `https://rsshub.app/...` 订阅能力，改写到用户配置的外部 RSSHub。
- 未配置外部 RSSHub 时弹出引导配置，并允许一次性使用 `https://rsshub.app` 作为默认（可失败，接受限流）。

**非目标**

- 不提供内置 RSSHub 的可选下载或插件模式。
- 不再维护 Lite 路由白名单或内置运行时健康检查。

## 3. 架构与数据流

### 3.1 URL 改写策略

- 命中 `rsshub://` 或 `https://rsshub.app/...`：
  - 若已配置 `rsshubCustomUrl`：改写为 `<customBase>/<path>?<query>#<hash>`。
  - 若未配置：弹出引导配置。
    - 用户选择“继续一次”时，改写为 `https://rsshub.app/<path>?<query>#<hash>`。
    - 用户取消时，直接返回错误给订阅流程。

### 3.2 运行时移除

- 删除 `RsshubManager` 及其状态机、健康探测、冷却逻辑。
- 移除 IPC：`getRsshubStatus` / `toggleRsshub` / `restartRsshub` / `setRsshubRuntimeMode` 等与本地运行时相关接口。

## 4. UI 与交互

- “本地 RSSHub 控制台”改为“外部 RSSHub 配置”。
- 删除 Lite/Official 模式切换 UI 与相关文案。
- 新增“未配置提示弹窗”用于拦截订阅动作：
  - 主文案：需要配置外部 RSSHub 实例。
  - 操作：
    - 立即配置（跳转设置页或内联输入）。
    - 继续一次（使用 `https://rsshub.app`）。
    - 取消。

## 5. 构建与资源调整

- 移除 `scripts/build-rsshub.ts` 相关构建产物与前置步骤。
- 移除 `apps/desktop/resources/rsshub` 目录与 `extraResource` 关联。
- `build:electron*` 不再前置执行 `build:rsshub`。

## 6. 兼容性与迁移

- 现有配置 `rsshubCustomUrl` 保留并继续生效。
- 旧的“本地 RSSHub 状态/运行时”设置将失效，需要迁移为外部配置入口。

## 7. 风险与缓解

- **首次失败率提升**：默认 `https://rsshub.app` 可能 403/限流。通过弹窗强调“建议自建”。
- **回归风险**：移除本地 IPC 与状态相关 UI，需覆盖订阅流程与设置页回归。

## 8. 测试策略

- 单测：`resolveRsshubUrl` 在无配置时的弹窗分支与默认改写逻辑。
- UI 回归：
  - 订阅 `rsshub://` 触发引导弹窗。
  - 配置外部 RSSHub 后可订阅成功。
  - 设置页相关入口与文案正确。

## 9. 成功标准

- 内置 RSSHub 相关资源与构建步骤全部移除。
- `rsshub://` 与 `rsshub.app` 仍可订阅并走外部实例。
- 未配置时明确引导，且“继续一次”可触发默认外部请求。
