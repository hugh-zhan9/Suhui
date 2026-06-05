# Suhui Agent CLI Clarification Bundle

- Timestamp: 2026-06-05 11:06:41 Asia/Shanghai
- Source request: `$clarify 我希望给suhui增加 cli 的能力，这样可以更加方便的交给 agent 来使用。 最初一般我希望支持 agent 的读取能力，包括文件列表，文章详情等`
- Handoff decision: `needs_spec`
- Recommended next artifact: `docs/loopx/design/Suhui Agent CLI需求设计文档.md`

## Intent And Desired Outcome

用户希望为 Suhui 增加 CLI 能力，主要服务 agent 使用。核心场景不是人直接在终端中长期交互，而是用户让 AI/agent 读取 Suhui 文章列表和文章详情，再把内容发送给用户。

期望 v1 提供稳定、可脚本化、可直接转述的读取入口：

- 查看文章列表。
- 查看文章详情。
- 查看订阅源列表作为导航辅助。
- 对明确指定的文章执行已读/未读标记。

## In-Scope Work

### CLI 运行模式

- CLI 通过本机 HTTP/remote API 访问运行中的 Suhui Desktop，不直接连接本地 Postgres。
- 默认连接 `http://127.0.0.1:41595`。
- 支持 `--base-url` 和 `SUHUI_CLI_BASE_URL` 覆盖 remote API 地址。
- remote 不可用时明确报错，v1 不自动启动 Electron。

### 新增 Agent 专用 Remote API

新增 `/api/agent/*` API，不直接让 CLI 使用现有粗粒度 `/api/entries` 全量接口。

原因：当前 `/api/entries` 不支持 `limit/cursor`，remote runtime client 会客户端裁剪。agent CLI 应在服务端查询层就限制数据量并稳定输出 schema。

拟定接口：

- `GET /api/agent/entries`
- `GET /api/agent/entries/:id`
- `GET /api/agent/feeds`
- `POST /api/agent/entries/read`

### CLI 命令边界

v1 命令：

- `suhui entries list`
- `suhui entries get <entryId>`
- `suhui feeds list`
- `suhui entries mark-read <entryId...>`
- `suhui entries mark-unread <entryId...>`

`entries list` v1 过滤：

- `--feed <feedId>`
- `--unread`
- `--read`
- `--limit <n>`
- `--cursor <cursor>`

分页：

- 默认 `--limit 20`。
- 最大 `--limit 100`。
- 默认排序：`publishedAt desc, insertedAt desc`。
- 使用 cursor 分页，不使用页码。

### 输出格式

- 默认 `--format markdown`。
- 额外支持 `--format json`。
- 不做 table 输出。
- JSON 是稳定的 agent 专用 schema，不承诺 remote API/数据库原始字段稳定。
- Markdown 用于 agent 直接转发给用户。

文章列表 Markdown：

- 默认包含标题、来源、时间、已读状态、URL、entryId。
- 默认不含摘要。
- 可通过 `--with-summary` 加摘要。

文章详情 Markdown：

- 默认输出完整可读正文。
- 支持 `--max-chars 12000` 等截断保护。
- 支持 `--content full|summary|metadata`。
- 默认 `full`。

正文选择：

- 优先 `readabilityContent`。
- 其次 `content`。
- 最后 `description`。
- JSON 保留 `contentSource` 标明实际来源。

HTML 到 Markdown：

- v1 应提供轻量 HTML-to-Markdown 转换，Markdown 输出不应原样吐大量 HTML。
- 不追求 100% 版式还原，优先可读、保留链接和段落。

### Feed 列表

v1 需要 `feeds list`，但作为辅助读取能力。

输出需要包含：

- `id`
- `subscriptionId`
- `title`
- `url`
- `siteUrl`
- `category`
- `unreadCount`

文章列表项也需要包含 `feedTitle`。

### 写入能力

v1 只支持明确 ID 的已读/未读写入：

- `suhui entries mark-read <entryId>`
- `suhui entries mark-read <entryId1> <entryId2>`
- `suhui entries mark-unread <entryId>`

不支持：

- `--all`
- `--feed <feedId>` 批量标记
- 基于筛选结果的批量写入

## Non-Goals

v1 不支持：

- CLI 直接连接 Postgres。
- 自动启动 Electron/Suhui Desktop。
- 系统级安装分发或随 `.dmg` 安装到 PATH。
- 刷新订阅源：`feeds refresh` / `feeds refresh-all`。
- 订阅增删改：`subscriptions add/delete/update`。
- 全文搜索。
- 日期范围过滤。
- 分类/view/作者高级过滤。
- table/human terminal UI。
- 真实 Electron E2E 测试。
- 真实 Postgres 集成测试。

## Decision Boundaries

已决策：

- v1 走运行中的 Suhui remote HTTP API。
- 新增 agent 专用 remote API。
- CLI 默认 Markdown，额外 JSON。
- JSON 输出为稳定 agent schema。
- Markdown 详情默认完整正文，带截断保护。
- v1 不限制 `/api/agent/*` 只能本机访问，跟随当前 remote server 暴露范围。
- CLI 放入独立 workspace 包 `apps/cli`，包名建议 `@suhui/cli`，bin 命令名 `suhui`。
- v1 不纳入 Electron 安装分发。

后续 plan 可自行决定：

- CLI 参数解析库选型。
- HTML-to-Markdown 具体依赖或轻量实现。
- agent API 内部文件拆分。
- Cursor 编码细节，只要满足稳定分页和排序。
- 测试 fixture 组织。

需要回到 clarify/spec 的变化：

- 要求 CLI 直接读数据库。
- 要求 remote API 权限/认证/token。
- 要求随安装器分发并进入 PATH。
- 要求刷新、订阅管理、搜索等写操作进入 v1。
- 改变默认输出格式。

## Constraints

- 必须以 `AI-CONTEXT.md` 为项目上下文事实源。
- 当前仓库是 Desktop-only，工作区为 `apps/desktop` + `packages/**/*` + `apps/desktop/layer/*`。
- `pnpm-workspace.yaml` 当前不包含 `apps/cli`，新增 CLI 需要调整 workspace。
- remote server 默认配置来自 `apps/desktop/layer/main/src/remote/config.ts`：
  - host: `0.0.0.0`
  - port: `41595`
- CLI 客户端默认应使用 `127.0.0.1` 连接。

## Success Criteria

- 用户/agent 能运行 CLI 获取 Markdown 文章列表。
- 用户/agent 能根据 entryId 获取 Markdown 文章详情。
- JSON 输出 schema 对 agent 稳定，字段不暴露内部 DB 原始形状。
- 文章列表支持 limit/cursor/feed/read/unread 过滤。
- feed 列表包含未读数和 feed 元信息。
- mark-read/mark-unread 对明确 entryId 生效。
- remote 不可用时 CLI 有稳定退出码和错误信息。
- 不需要真实 Postgres 或 Electron E2E 即可通过 focused tests 验证主要契约。

## Assumptions Challenged

- “文件列表”最初表述经澄清后是“文章列表”，不是文件系统列表，也不是订阅源列表。
- HTTP/remote API 不会比直接 Postgres 慢到影响 v1；真正风险是全量拉取，所以需要 agent 专用分页 API。
- 默认 JSON 不符合主要场景；用户更常让 AI 直接把 CLI 内容发给自己，因此默认 Markdown 更合适。
- LAN/VPN 可访问文章列表和详情的风险用户可接受，v1 不增加本机限制。

## Key Decisions And Rejected Alternatives

| Decision       | Accepted                    | Rejected                         | Rationale                                                |
| -------------- | --------------------------- | -------------------------------- | -------------------------------------------------------- |
| Runtime access | CLI -> remote HTTP API      | CLI -> Postgres                  | 复用主进程应用边界，避免 DB 配置、迁移、锁和并发写入风险 |
| API shape      | `/api/agent/*`              | 现有 `/api/entries` 后客户端裁剪 | 需要服务端 limit/cursor 和 agent schema                  |
| Output default | Markdown                    | JSON default                     | 用户主要希望 AI 直接转发可读内容                         |
| Install target | Repo 内开发 CLI             | 随 Electron 安装器分发           | 分发/PATH/签名是另一风险面                               |
| Write scope    | explicit entry IDs only     | all/feed/filter 批量写入         | 降低 agent 误操作风险                                    |
| Security       | 跟随 remote server 暴露范围 | localhost-only agent API         | 用户接受 LAN/VPN 读取风险                                |

## Brownfield Evidence Vs Inference

### Evidence

- `AI-CONTEXT.md` 说明 Suhui 当前是 Desktop-only、本地 RSS 阅读器，remote browser access 已落地。
- `apps/desktop/layer/main/src/remote/config.ts` 定义默认 remote host/port 为 `0.0.0.0:41595`。
- `apps/desktop/layer/main/src/remote/manager.ts` 已有 remote HTTP server，包含 `/api/entries`、`/api/entries/:id`、`/api/subscriptions`、`/api/unread`、`/api/entries/read`。
- `apps/desktop/layer/main/src/application/entry/service.ts` 已有 `listEntries`、`getEntry`、`updateReadStatus`。
- `apps/desktop/layer/main/src/application/subscription/service.ts` 已有 subscription + feed title fallback 聚合。
- `apps/desktop/layer/main/src/application/unread/service.ts` 已有 unread count 聚合。
- `packages/internal/database/src/schemas/postgres.ts` 中 entry 字段包含 `readabilityContent`、`content`、`description`、`feedId`、`read`、`publishedAt`、`insertedAt`。
- `packages/internal/store/src/runtime/client.ts` 的 remote entries list 当前调用 `/api/entries` 后在客户端排序、cursor 过滤和 slice。
- `pnpm-workspace.yaml` 当前没有 `apps/cli`。

### Inference

- Agent 专用 API 应位于 main remote 边界下，而不是 packages/store runtime，因为 CLI 不运行 renderer，也不需要 store hydrate。
- Feed 列表 API 需要聚合 subscriptions、feeds、unread；现有 `/api/subscriptions` 不足以完整返回 URL/siteUrl/unreadCount。
- HTML-to-Markdown 可选择新增依赖或轻量工具，具体由 plan/implementation 决定。

## Residual Risks

- 当前 remote server 默认监听 `0.0.0.0`，agent API 不加本机限制会扩大 LAN/VPN 内可读面；用户已接受。
- 如果文章正文非常长，即使有 `--max-chars` 也需要避免破坏 Markdown 链接/代码块过多，设计中需明确截断语义。
- Cursor 如果只用 `publishedAt`，同时间文章可能分页重复/漏项；设计需采用复合 cursor 或稳定 tie-breaker。
- Markdown 转换质量取决于工具选型，v1 不应承诺完整保真。

## Conversation Summary And Important User Wording

- 用户最初希望“给suhui增加 cli 的能力，这样可以更加方便的交给 agent 来使用”。
- 用户最初说“文件列表”，后澄清为“文章列表”。
- 用户接受 CLI 通过本机 HTTP/remote API，不直接连接 Postgres。
- 用户接受新增 agent 专用 remote API。
- 用户表示 LAN/VPN 内别人理论上也能读取文章列表和详情“是我可以接受的”。
- 用户希望默认 Markdown，因为“更加频繁的使用场景应该是 让 ai 直接把内容给我，而不是 agent 理解之后发给我”。

## Source Requirements Or External Documents

- `AI-CONTEXT.md`
- Current conversation
- Repo evidence listed above

## Next Handoff Recommendation

该需求涉及产品行为、API contract、CLI contract、安全边界和跨模块架构，应进入 `spec`，不是直接 plan。

Recommended command after spec:

```text
$plan docs/loopx/design/Suhui Agent CLI需求设计文档.md
```
