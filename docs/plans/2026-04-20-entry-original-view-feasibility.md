# 文章阅读窗口“阅读原文”按钮可行性分析

## 1. 结论

截至 2026-04-20，基于当前代码，桌面端实现该需求是可行的，且整体属于“已有底层能力、缺少显式入口和失败态补足”的改造，不是从零开发。

结论分层如下：

- 桌面端文章阅读窗口：高可行
- 远程浏览器访问端：部分可行，但不建议纳入同一期
- “所有站点都能稳定内嵌显示原网页”：不可承诺

## 2. 已有能力基础

当前仓库已经具备与本需求直接相关的核心能力。

### 2.1 已存在原文查看命令

`apps/desktop/layer/renderer/src/modules/command/commands/entry.tsx`

- 已定义 `COMMAND_ID.entry.viewSourceContent`
- 命令行为不是跳浏览器，而是切换 `showSourceContent`
- 对部分宽视图会弹 modal，对普通详情阅读页会切换当前阅读区原文面板

这意味着“阅读原文”行为本身已经存在，不需要重新设计一套状态管理。

### 2.2 已存在原文显示状态

`apps/desktop/layer/renderer/src/atoms/source-content.tsx`

- 已提供 `useShowSourceContent`
- 已提供 `toggleShowSourceContent`
- 已提供 `enableShowSourceContent` / `resetShowSourceContent`
- 已提供基于 `SourceContentView` 的 modal 容器

这意味着按钮激活态、切换态、导航切换后的复位逻辑都有现成基础设施。

### 2.3 已存在阅读区原文面板

`apps/desktop/layer/renderer/src/modules/entry-content/EntryContent.tsx`

- 详情页底部已经挂载 `SourceContentPanel`
- `SourceContentPanel` 会在 `showSourceContent=true` 时覆盖文章阅读区域

`apps/desktop/layer/renderer/src/modules/entry-content/components/SourceContentView.tsx`

- Electron 环境走 `webview`
- 非 Electron 环境走 `iframe`
- 已有基本加载态

这意味着桌面端“在软件页面内看原文”的核心渲染能力已经在用。

### 2.4 Electron 主窗口已开启 `webview`

`apps/desktop/layer/main/src/manager/window.ts`

- `webPreferences.webviewTag = true`

因此桌面端当前架构允许在阅读区内嵌网页，不需要新增主窗口级能力开关。

### 2.5 已存在外部浏览器兜底行为

`apps/desktop/layer/renderer/src/modules/command/commands/entry.tsx`

- `COMMAND_ID.entry.openInBrowser` 已存在
- 当前通过 `window.open(entry.url, "_blank")` 打开外部浏览器

因此原文加载失败时的兜底路径也是现成的。

## 3. 当前缺口

### 3.1 主按钮区没有显式入口

`apps/desktop/layer/renderer/src/modules/entry-content/components/EntryTitle.tsx`

当前详情标题右上角只显式渲染了：

- 已读/未读
- 导出 PDF
- 收藏

这里正是用户提到的目标位置，但没有“阅读原文”按钮。

### 3.2 快捷头部按钮区也未显式暴露

`apps/desktop/layer/renderer/src/modules/entry-content/components/entry-header/internal/EntryHeaderActionsContainer.tsx`

当前只固定暴露：

- 收藏
- 导出 PDF
- 其余动作进入 `EntryHeaderActions` / `MoreActions`

说明原文能力虽然在 action 系统里，但没有被提升为一级显式按钮。

### 3.3 失败态不足

`apps/desktop/layer/renderer/src/modules/entry-content/components/SourceContentView.tsx`

当前只有加载态，没有明确的：

- `did-fail-load` 失败态
- 站点拒绝嵌入说明
- “在浏览器打开”兜底按钮

如果直接把该能力提升成主按钮而不补失败态，用户会遇到“点了以后空白/没反应”的问题。

### 3.4 键盘与显式按钮未完全对齐

`apps/desktop/layer/renderer/src/modules/entry-content/components/entry-content/EntryCommandShortcutRegister.tsx`

当前注册了：

- 打开浏览器
- 复制链接
- 已读/未读
- 收藏
- 分享

但没有把“原文视图切换”作为详情阅读区内的显式快捷入口的一部分。

这不是主阻塞，但说明这项能力当前仍然处于“次入口”状态。

## 4. 实现复杂度评估

### 4.1 桌面端一期

复杂度：低到中

预计主要是 renderer 改动，不需要数据库、IPC 协议或主进程数据面改造。

主要改动点：

- 在 `EntryTitle.tsx` 新增“阅读原文”按钮
- 视需要在 `EntryHeaderActionsContainer.tsx` 保持按钮一致性
- 复用 `COMMAND_ID.entry.viewSourceContent`
- 在 `SourceContentView.tsx` 增加失败态、空态和兜底操作
- 补少量交互测试或组件测试

### 4.2 远程浏览器端一期

复杂度：中到高

原因：

- 远程端不在 Electron 环境，无法使用 `webview`
- 只能依赖浏览器 `iframe`
- 大量新闻站、博客平台、社交媒体页面会禁止跨站嵌入
- 当前远程端详情页只有 “Open Original” 外链按钮，没有内嵌原文容器

因此如果把远程端也纳入本期，业务承诺和实际成功率会明显失衡。

## 5. 主要技术风险

### 5.1 第三方站点禁止嵌入

这是首要风险，也是不能通过简单前端改动解决的问题。

常见触发原因：

- `X-Frame-Options: DENY` / `SAMEORIGIN`
- `Content-Security-Policy: frame-ancestors`
- 登录态、反爬、验证码、Cloudflare 等限制

直接影响：

- 有些站点可以在应用内正常展示
- 有些站点会白屏、报错或被浏览器/Electron 拒绝渲染

因此需求只能承诺“尽量在应用内显示，失败时明确降级到浏览器打开”，不能承诺“所有原文都能在应用内稳定显示”。

### 5.2 当前组件缺少明确失败反馈

如果不补 `did-fail-load` 等失败处理，用户会误以为功能失效或软件卡住。

### 5.3 原文视图与正文视图的状态协同

需要确保以下行为不回退：

- 切文章时的视图复位
- `entry.settings.sourceContent` 的自动打开行为
- 导出 PDF 仍然导出正文/可读内容，而不是误导出网页壳

这些都可控，但需要在需求实现时明确。

## 6. 不建议的一期方案

以下方案理论上可提升“原文内嵌成功率”，但不适合作为本期实现：

- 在主进程增加网页抓取代理，再把第三方网页反向代理到本地域名
- 重写站点响应头或 HTML 以规避嵌入限制
- 为远程浏览器端单独增加内容代理和资源重写链路

原因：

- 复杂度显著升高
- 安全与兼容性风险更高
- 维护成本大
- 与当前“桌面本地 RSS 阅读器”的主价值不成比例

## 7. 建议实施方案

建议拆成两个阶段。

### 阶段 1：桌面端显式入口化

目标：

- 在文章详情按钮组中新增“阅读原文”
- 直接复用现有 `viewSourceContent` 命令和 `SourceContentPanel`
- 补齐加载失败提示和“在浏览器打开”兜底按钮

收益：

- 用户主诉能被直接解决
- 技术改动集中
- 不触碰数据层

### 阶段 2：视需要评估远程端

前提：

- 先验证桌面端用户是否高频使用该功能
- 再决定远程端是否只做 iframe 尝试，还是明确保持外链打开

建议：

- 远程端默认仍以外链为主
- 若一定要做应用内展示，只能以“尽力尝试，不保证成功”的策略上线

## 8. 对需求范围的建议结论

建议将本次需求明确收敛为：

- 桌面端文章详情页新增显式“阅读原文”按钮
- 在应用内优先展示原网页
- 无法嵌入时明确提示并允许一键在浏览器打开

不建议在同一期绑定以下承诺：

- 远程浏览器端也必须支持
- 所有网站都必须能在应用内打开
- 原文视图需要替代 Readability 正文视图

## 9. 总体判断

如果目标是“让桌面端用户在文章阅读窗口里更直接地看到原文页面”，当前仓库已经具备 70% 以上的实现基础，剩余工作主要是：

- 补主按钮入口
- 补失败态
- 补交互细节

因此，该需求适合进入开发，不建议再停留在抽象讨论阶段。
