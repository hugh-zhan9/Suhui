---
source: docs/loopx/design/2026-09-04-progressive-translation/需求设计文档.md
status: ready
slices:
  - id: P-001
    status: complete
    depends: []
  - id: P-002
    status: complete
    depends: [P-001]
  - id: P-003
    status: complete
    depends: [P-002]
  - id: P-004
    status: complete
    depends: [P-003]
  - id: P-005
    status: complete
    depends: [P-002, P-003, P-004]
---

# 渐进式文章与选区翻译执行计划

## Goal And Boundaries

交付可选择 Chat Completions/Responses 的 Desktop 在线翻译、可诊断安全错误、当前文章常驻翻译按钮、长文段落批次渐进结果和选区翻译。保持 DeepL、历史配置、最终数据库缓存、双语/仅译文和 Remote 边界；不实现逐行/token 流、跨协议自动重试或中间态持久化。

## P-001 两种 OpenAI-compatible 协议与安全错误

共享配置和主进程 provider 支持显式协议，旧配置缺字段继续走 Chat。Responses 请求和响应解析通过契约测试，400 只从 JSON allowlist 提取原因、折叠空白、清理当前及常见密钥并限制为 500 字符。设置页允许保存、测试所选协议，配置指纹包含协议；配置更新必须继续等待在途同服务任务结束，再清缓存并切换协议，禁止新旧配置结果混用。翻译继续使用隔离 Electron Session/proxy adapter，不新增 Node 直连。

> writes: `packages/internal/shared/src/translation.ts`, `apps/desktop/layer/main/src/lib/store.ts`, `apps/desktop/layer/main/src/application/translation/provider.ts`, `apps/desktop/layer/main/src/application/translation/provider.test.ts`, `apps/desktop/layer/main/src/application/translation/service.ts`, `apps/desktop/layer/main/src/application/translation/service.test.ts`, `apps/desktop/layer/renderer/src/modules/settings/tabs/general.tsx`, `apps/desktop/layer/renderer/src/modules/settings/tabs/translation-provider-settings.test.ts`, `locales/settings/en.json`, `locales/settings/ja.json`, `locales/settings/zh-CN.json`, `locales/settings/zh-TW.json`, `locales/settings/fr-FR.json`
> anchors: `AC-001, AC-002, D-001, D-002, TC-001, TC-002`
> verify: `pnpm exec vitest run apps/desktop/layer/main/src/application/translation/provider.test.ts apps/desktop/layer/main/src/application/translation/service.test.ts apps/desktop/layer/renderer/src/modules/settings/tabs/translation-provider-settings.test.ts`
> review: `协议兼容、旧配置默认、错误消息密钥清理、不发生跨协议重复请求、configuration barrier 等待在途任务后再清缓存/切换`

## P-002 渐进翻译契约与有界并发

HTML plan 支持未完成槽位保留原文；标签、属性、URL、媒体和代码继续完全留在本地且由 `html.test.ts` 钉住。service 严格按 4,000 UTF-16 code units 分批、超长单槽不拆分语义节点，最多两个 worker 合并乱序结果，并只在完整成功后写数据库。既有 `entryId:language` main 队列继续作为最终缓存的单写者边界：同 key 重复请求串行，后一个请求重读完整缓存，不使用数据库锁。IPC 仅向调用 sender 发送 `{ requestId, entryId, language, completedBatches, totalBatches, translation }`；计数必须满足 `completedBatches <= totalBatches`。renderer store 按 requestId/entryId/language 过滤旧事件、更新会话内部分结果，并在最终成功或失败后移除 listener；最终 Promise 形状不变。

> writes: `packages/internal/shared/src/translation.ts`, `apps/desktop/layer/main/src/application/translation/html.ts`, `apps/desktop/layer/main/src/application/translation/html.test.ts`, `apps/desktop/layer/main/src/application/translation/service.ts`, `apps/desktop/layer/main/src/application/translation/service.test.ts`, `apps/desktop/layer/main/src/ipc/services/translation.ts`, `apps/desktop/layer/main/src/ipc/services/translation.test.ts`, `packages/internal/store/src/modules/translation/store.ts`, `packages/internal/store/src/modules/translation/hooks.ts`, `packages/internal/store/src/modules/translation/translation-progress.test.ts`
> anchors: `AC-004, AC-006, D-003, D-004, D-005, D-008, TC-004, TC-006`
> verify: `pnpm exec vitest run apps/desktop/layer/main/src/application/translation/html.test.ts apps/desktop/layer/main/src/application/translation/service.test.ts apps/desktop/layer/main/src/ipc/services/translation.test.ts packages/internal/store/src/modules/translation/translation-progress.test.ts`
> review: `4,000 UTF-16 边界、超长单槽不拆分、HTML 私密内容不外发、批次并发上限、乱序槽位正确性、完整事件 payload/计数不变量/listener cleanup、事件定向/过滤、失败不落完整缓存、同 entryId:language 重复请求串行且后请求重读缓存`

## P-003 当前文章按钮与可见状态

当前文章覆盖支持 follow-global/force-on/force-off，导航清除。文章 header 常驻按钮显示有效开关、加载/部分进度、完成和失败；按钮关闭时显示原文，全局开关只控制自动开始。重复开启由相同 TanStack Query key 去重，不增加数据库协调；关闭只停止显示和后续自动触发，不取消已经提交的上游计费请求。原有更多操作命令与新按钮使用同一状态语义。

> writes: `apps/desktop/layer/renderer/src/atoms/ai-translation.ts`, `apps/desktop/layer/renderer/src/atoms/ai-translation.test.ts`, `apps/desktop/layer/renderer/src/hooks/biz/useNavigateEntry.ts`, `apps/desktop/layer/renderer/src/hooks/biz/useEntryActions.tsx`, `apps/desktop/layer/renderer/src/modules/entry-content/EntryContent.tsx`, `apps/desktop/layer/renderer/src/modules/entry-content/components/entry-header/internal/EntryHeaderActionsContainer.tsx`, `apps/desktop/layer/renderer/src/modules/entry-content/components/entry-header/internal/EntryHeaderActionsContainer.test.tsx`, `locales/app/en.json`, `locales/app/ja.json`, `locales/app/zh-CN.json`, `locales/app/zh-TW.json`, `locales/app/fr-FR.json`
> anchors: `AC-003, D-006, TC-003`
> verify: `pnpm exec vitest run apps/desktop/layer/renderer/src/modules/entry-content apps/desktop/layer/renderer/src/atoms`
> review: `全局自动与当前覆盖优先级、导航重置、同 Query key 去重、不取消已提交上游请求、错误和进度状态可见性`

## P-004 选区显式翻译

main 增加有 20,000 字符上限的单文本翻译；renderer 只在用户点击选区按钮后调用，并在浮层显示结果。空白本地和 main 双重拒绝，重复选区调用相互独立且不增加数据库协调，失败使用可复制 toast，结果不写文章缓存且 Remote 不增加路由。

> writes: `packages/internal/shared/src/translation.ts`, `apps/desktop/layer/main/src/application/translation/service.ts`, `apps/desktop/layer/main/src/application/translation/service.test.ts`, `apps/desktop/layer/main/src/ipc/services/translation.ts`, `packages/internal/store/src/modules/translation/store.ts`, `packages/internal/store/src/modules/translation/translation-selection.test.ts`, `apps/desktop/layer/renderer/src/modules/entry-content/components/layouts/ArticleLayout.tsx`, `apps/desktop/layer/renderer/src/modules/entry-content/components/selection/TextSelectionToolbar.tsx`, `apps/desktop/layer/renderer/src/modules/entry-content/components/selection/TextSelectionToolbar.test.tsx`, `locales/app/en.json`, `locales/app/ja.json`, `locales/app/zh-CN.json`, `locales/app/zh-TW.json`, `locales/app/fr-FR.json`
> anchors: `AC-005, AC-006, D-007, D-008, TC-005, TC-006`
> verify: `pnpm exec vitest run apps/desktop/layer/main/src/application/translation/service.test.ts packages/internal/store/src/modules/translation/translation-selection.test.ts apps/desktop/layer/renderer/src/modules/entry-content/components/selection/TextSelectionToolbar.test.tsx`
> review: `选区只在显式点击后外发、重复调用相互独立、长度边界、无持久化和错误安全性`

## P-005 集成与回归收口

整合协议、进度、按钮和选区行为，仅更新项目单一事实源与设计/计划的完成状态和实现事实，不改变已批准 AC/D 契约；验证全部新旧路径、格式、类型和 Electron 构建。精确 diff 接受独立安全/兼容审查后才完成。

> writes: `AI-CONTEXT.md`, `docs/loopx/design/2026-09-04-progressive-translation/设计提案.md`, `docs/loopx/design/2026-09-04-progressive-translation/需求设计文档.md`, `docs/loopx/plans/2026-09-04-progressive-translation.md`
> anchors: `AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, D-001, D-002, D-003, D-004, D-005, D-006, D-007, D-008, TC-001, TC-002, TC-003, TC-004, TC-005, TC-006`
> verify: `pnpm test && pnpm typecheck && pnpm --filter suhui build:electron-vite && pnpm exec prettier --check apps/desktop/layer/main/src/application/translation apps/desktop/layer/main/src/ipc/services/translation.ts packages/internal/shared/src/translation.ts packages/internal/store/src/modules/translation apps/desktop/layer/renderer/src/atoms/ai-translation.ts apps/desktop/layer/renderer/src/hooks/biz/useEntryActions.tsx apps/desktop/layer/renderer/src/modules/entry-content apps/desktop/layer/renderer/src/modules/settings/tabs/general.tsx locales/settings locales/app docs/loopx/design/2026-09-04-progressive-translation docs/loopx/plans/2026-09-04-progressive-translation.md AI-CONTEXT.md && git diff --check`（若根 typecheck 命中已知基线错误，记录完整命令、错误和与本次 diff 的归属）
> review: `完整 diff 的秘密边界、IPC 调用方隔离、兼容、竞态、失败持久化和 UI 状态一致性`

## Integration And Final Verification

- 以测试证明 `/responses` 与 `/chat/completions` 各只发一个请求且解析一致。
- 以乱序批次测试证明首批可见、进度单调、最终 HTML 槽位正确和失败不写库。
- 以 renderer 测试证明当前按钮、全局设置、导航、选择翻译和错误状态。
- 运行全仓测试、Electron 生产构建、格式和 diff 检查；记录根 typecheck 的既有阻塞或通过证据。

## Handoff And Residual Risks

- Blockers: none.
- Residual risks: 第三方 Responses 实现存在字段差异；通过显式选择、标准解析和明确错误控制，不做重复请求兜底。
- Resume note: 从 P-001 的 provider 契约红测开始；工作区已有用户的高亮/文章布局改动，逐文件重读并避免覆盖。
