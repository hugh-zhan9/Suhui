# 本地翻译排查

翻译记录写入应用已有的 `main.log`，沿用 electron-log 的文件轮转；上一份文件为 `main.old.log`。macOS 的默认位置为 `~/Library/Logs/溯洄/`。需安装包含本次修改的应用，旧版本不会产生这些记录。

复现时观察：

```sh
tail -F "$HOME/Library/Logs/溯洄/main.log" | rg --line-buffered '\[translation\]'
```

日志的 `scope=reader` 表示阅读区标题与正文，`scope=list` 表示列表标题与摘要；两种范围分别调用、分别完成或失败。同一文章仍串行执行，因此后发请求可能排队，但摘要失败不会变成正文失败。列表摘要仅在既有列表翻译启用条件下按需请求，不再由阅读区顺带触发。

错误里的“诊断 ID”对应日志的 `traceId`。用该 ID 在 `main.log` 和 `main.old.log` 内搜索，可以找到一次任务的所有记录。文章 ID 只记录不可逆摘要 `entryRef`；标题、摘要和正文请求共享任务诊断 ID，由 `target` 和 `batchIndex` 区分。

| 最后记录或字段                        | 如何判断                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `job.queued`                          | 正在等待同一文章之前的任务；尚未调用服务商                                                   |
| `job.waiting_configuration`           | 已离开文章队列，正在等待配置更新完成                                                         |
| `source.loading` / `cache.reading`    | 正在读取本地文章或缓存                                                                       |
| `body.planned`                        | 已计算正文分批数量和待翻译字符数                                                             |
| `request.started`                     | 本批开始请求；包括服务类型、协议、字符数、超时配置                                           |
| `request.headers`                     | 已收到 HTTP 响应头；`elapsedMs` 是从本批开始到响应头到达的时间                               |
| `request.failed` + `waiting_response` | 尚未收到响应头；范围包括本地会话初始化、网络连接、网关等待和服务商处理，不能仅凭此断言模型慢 |
| `request.failed` + `reading_response` | 响应头已到，读取响应体或解析结果失败；同时检查 `httpStatus` 与 `errorKind`                   |
| `request.completed` / `body.progress` | 本批结果已解析成功 / 部分正文已提交到进度回调                                                |
| `batch.failed` / `job.partial`        | 阅读区某批失败但继续后续任务 / 所有批次已处理但还有失败；不会写完整缓存                      |
| `batch.retry_started`                 | 用户显式重试一批；`sessionId` 对应首次任务 ID，当前 `traceId` 对应此次重试                   |
| `cache.writing` / `job.completed`     | 正在保存完整结果 / 整个任务成功                                                              |

`queueMs` 包含排队及配置等待，`elapsedMs` 分别按事件所属的请求或整个任务计时。在线 AI 每批最多等待 120 秒，DeepL 为 60 秒；记录日志不会增加自动重试或修改超时。

`outputFormat=text` 表示单条输入直接请求译文，模型输出不需要 JSON 转义；`json_array` 表示多条行内片段仍按 JSON 数组逐项对应；`provider_json` 为 DeepL 原生协议。三种路径对调用方都返回字符串数组，分批数量和并发不变。

`validationIssue=empty_output` 为单条非空原文收到空译文；`refused_output` 为服务显式拒绝或内容过滤；`failed_output` 为 Responses 的 `failed/cancelled`；`incomplete_output` 为 Responses 的 `incomplete/in_progress/queued` 或 Chat 的 `finish_reason=length`。这些结果即使 HTTP 200 且带部分文本，也不能视为成功。缺省完成状态仍保持兼容，日志不记录拒绝原因原文。

HTTP 200 只说明请求成功返回，不保证翻译结果符合约定。`errorKind=invalid_translation` 表示结果校验失败：`validationIssue=invalid_shape` 为缺少 `translations` 数组或字段类型错误，`count_mismatch` 为条目数量不符，`invalid_item` 为数组中存在非字符串。`expectedCount` 是本批输入数量；仅在返回值确为数组时记录 `receivedCount`。不会记录数组内容，也不会自动拼接、补齐或截断错误结果。

`errorKind=invalid_json` 表示 JSON 解析失败。`parseStage=response_body` 为 HTTP 响应体本身无法解析；`translation_json` 为响应体有效，但模型生成的译文 JSON 无效。后者记录 `outputCharacters` 和 `completionState=complete/incomplete/unknown`，完成状态仅来自服务的固定状态枚举；缺失时不能推断截断原因。错误提示不再透传可能带响应片段的原始 `SyntaxError`。解析时先尝试完整字符串，再提取包裹在代码围栏或说明文字里的 JSON 对象，避免合法译文中的代码围栏被误截取；不会补引号、猜测缺失译文或自动重试。

诊断 ID `1d9c952c-958a-4c03-970a-be899ac161e0` 的既有日志显示：正文第 6/178 批，1 条输入、363 字符，HTTP 200 后发生 `invalid_json`，本批耗时约 39 秒。旧日志没有解析阶段、输出长度和完成状态，无法确认是 HTTP 响应损坏、模型输出未闭合还是本地提取问题；不能把已修复的围栏提取缺陷直接当作这次失败的确定根因。

诊断 ID `5f694db3-0b8f-408a-acc4-2a66b53d66bc` 的新增日志已确认：第 6/178 批为单条 363 字符输入，约 37 秒收到 HTTP 200；HTTP 响应体有效，模型译文 173 字符在 `translation_json` 阶段失败，`completionState=complete`。这排除了本次请求超时或 HTTP 外层 JSON 损坏，但没有原始响应，无法定位具体坏字符。本轮将单条输入改为直接文本输出，消除这一格式失败点；多条 JSON 仍严格拒绝错误结果。隔离真实接口复现因钥匙串未能解密而停止，没有新增真实上游成功证据。

旧版把以上三种情况都提示为“翻译条目数量不匹配”，旧日志只有 `errorKind=error`，无法追溯实际返回数量。新增分类和数量字段需安装包含此次校验改动的版本才能生效。

日志不包含 API Key、请求头、原文、译文、服务 URL、模型名或原始错误体。服务商返回的安全错误原因仍显示在界面中，可与诊断 ID 一起复制。日志写入失败不会改变翻译结果。

复制按钮位于桌面窗口顶部，必须排除原生窗口拖动区域。成功显示“已复制”；系统剪贴板失败时保留错误原文并提示手动复制。不要仅靠测试里调用 DOM `click()` 判断 Electron 中鼠标能否触发按钮，还应验证真实窗口点击与粘贴。

2026-09-16 用户报告诊断 ID `4e6dc207-add7-4bfd-8db3-3279d64b54cd`：正文第 151/178 批、46 字符、120 秒未收到响应头。本机现存轮转日志未找到该 ID，不能确认网关或上游具体原因。该错误仅说明响应头前超时，不能据字符少就归因模型或继续提高上限。此次修复针对失败影响：后续批次继续，失败保留原文并提供单批手动重试，状态区显示部分失败。原文/服务配置变化或检查点淘汰时拒绝旧重试；状态栏提供“重新翻译全文”。缓存写入失败仍显示错误，即使最后一批译文已显示，也不能提示全部完成。
