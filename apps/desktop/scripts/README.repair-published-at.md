# repair-published-at

`apps/desktop/scripts/repair-published-at.ts` 用于诊断和修复历史上被错误写入的 `entries.publishedAt`。

问题背景：

- 旧逻辑在无法解析文章发布时间时，会把 `publishedAt` 兜底成抓取当下的时间。
- 这会导致文章列表看起来像按“入库时间”而不是真实发布时间排序。
- 当前新逻辑已经停止继续写入这类脏数据，这个脚本用于处理历史遗留数据。

## 适用范围

这个脚本适用于：

- 你已经有一份真实的本地 Postgres 数据库
- 当前订阅的 feed 仍然可以联网抓取
- 你希望优先修复“高置信度”的旧数据，而不是全量暴力改库

这个脚本不适用于：

- 没有数据库连接配置
- 当前环境无法访问 feed 源站
- 需要修复已经不再出现在 feed 输出里的所有历史文章

## 修复策略

脚本采用保守策略，只修“很像被污染”的条目：

1. 从数据库读取当前已订阅 feed 的最近一批文章
2. 找出 `publishedAt` 与 `insertedAt` 几乎相同的可疑条目
3. 重新抓取当前 feed XML
4. 用 `guid / url / title` 做宽松匹配
5. 只有远端文章时间足够可信，且与本地时间差足够大时，才更新 `publishedAt`

默认不会改数据，必须显式传 `--mode apply` 才会写库。

## 前提条件

脚本启动前需要满足：

- 仓库根目录存在正确的 `.env`
- `.env` 中包含桌面端数据库连接需要的环境变量
- 本地 Postgres 可连通
- 机器可以访问订阅 feed 的 URL

脚本会自动读取仓库根目录 `.env`，并复用桌面端已有的 Postgres 配置逻辑。

## 使用方式

在仓库根目录执行。

先做诊断，不改库：

```bash
pnpm --filter suhui exec tsx apps/desktop/scripts/repair-published-at.ts
```

只诊断某个 feed：

```bash
pnpm --filter suhui exec tsx apps/desktop/scripts/repair-published-at.ts --feed-id <feedId>
```

输出报告到文件：

```bash
pnpm --filter suhui exec tsx apps/desktop/scripts/repair-published-at.ts --output /tmp/published-at-report.json
```

确认样本后再实际修复：

```bash
pnpm --filter suhui exec tsx apps/desktop/scripts/repair-published-at.ts --mode apply
```

## 参数说明

- `--mode report|apply`
  - `report` 是默认值，只输出诊断报告
  - `apply` 会把可修复条目的 `publishedAt` 更新到数据库
- `--feed-id <feedId>`
  - 只处理某个 feed，适合先做小范围验证
- `--limit-per-feed <number>`
  - 每个 feed 最多扫描多少条，默认 `500`
- `--suspicious-window-ms <number>`
  - 判定“`publishedAt` 很像被写成入库时间”的时间窗口，默认 `5000`
- `--min-correction-ms <number>`
  - 只有远端时间与本地时间差至少达到这个阈值才会修，默认 `3600000`
- `--request-timeout-ms <number>`
  - 抓取 feed 的超时时间，默认 `15000`
- `--output <path>`
  - 把 JSON 报告写到指定文件

## 推荐执行顺序

建议按下面顺序执行：

1. 先跑 `report` 模式
2. 优先加 `--feed-id` 看单个 feed 的样本
3. 确认 `samples` 里的标题、时间和修复动作符合预期
4. 再对全量 feed 跑一次 `report`
5. 最后才执行 `--mode apply`

如果你要在生产数据上执行，建议先备份数据库。

## 报告结构

脚本会输出一份 JSON，顶层字段大致如下：

- `mode`
  - 本次运行模式，`report` 或 `apply`
- `scannedFeeds`
  - 扫描了多少个 feed
- `suspiciousEntries`
  - 命中可疑规则的条目数
- `repairableEntries`
  - 能从当前 feed 中匹配到并可修复的条目数
- `appliedEntries`
  - 实际写回数据库的条目数，仅 `apply` 模式会大于 `0`
- `feeds`
  - 每个 feed 的详细结果

单个 `feed` 节点里重点看这些字段：

- `scannedEntries`
- `suspiciousEntries`
- `repairableEntries`
- `unrecoverableEntries`
- `samples`
- `error`

`samples` 里会给出最多 10 条样本，便于人工抽查：

- `entryId`
- `title`
- `localPublishedAt`
- `insertedAt`
- `remotePublishedAt`
- `action`

其中 `action` 有两种：

- `repair`
  - 命中修复条件，`apply` 模式下会更新
- `report-only`
  - 只是报告，不会自动修改

## 已知边界

这个脚本有明确边界，不是“全自动历史纠错”：

- 它只处理当前仍属于订阅的 feed
- 它只能修复当前 feed 输出里还能重新匹配到的文章
- 如果某篇历史文章已经不在 feed XML 里，脚本通常只能报告，不能安全回填
- 它不会改 entry ID
- 它不会主动改读状态、收藏状态或其他字段

## 风险控制

当前实现的风险控制点：

- 默认 `report`，不写库
- 只对高置信度可疑条目动手
- 远端时间不存在或不可信时不修
- 远端时间与本地时间差不够大时不修
- 每个 feed 都会单独记录错误，不会因为单个 feed 失败导致整批无结果

## 常见建议

- 第一次使用时，先挑 1 到 3 个你最确定“排序明显不对”的 feed 做验证
- 如果某些站点经常不给 `guid`，匹配更依赖 `url/title`，建议先看 `samples`
- 如果你怀疑命中过少，可以适当放宽 `--suspicious-window-ms`
- 如果你担心误修，可以把 `--min-correction-ms` 调大

## 相关文件

- 脚本入口：[repair-published-at.ts](/Users/zhangyukun/project/Suhui/apps/desktop/scripts/repair-published-at.ts)
- 判定逻辑：[published-at-repair.ts](/Users/zhangyukun/project/Suhui/apps/desktop/layer/main/src/manager/published-at-repair.ts)
- 判定测试：[published-at-repair.test.ts](/Users/zhangyukun/project/Suhui/apps/desktop/layer/main/src/manager/published-at-repair.test.ts)
