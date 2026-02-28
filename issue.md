这个文档是记录当前系统存在的问题，以及对应的修复方案。
你修复完成一个问题之后需要使用删除线标注对应的问题，同时记录修复方式和改动范围，如果有必要的话你需要调整 [text](AI-CONTEXT.md) 文件，以保证该文件内容的准确性。

1. ~~取消订阅，页面显示成功，订阅信息也没有再出现了。但是当页面自动刷新之后，订阅信息又出现了, 取消订阅应该要删除掉数据库中的数据才对， 目前看起来并没有删除。~~
   修复方式：取消订阅时不再仅按单一 subscription id 删除，而是同时按 `id/feedId/listId/inboxId` 做目标删除，确保脏重复订阅记录会被一并清理。  
   改动范围：`packages/internal/store/src/modules/subscription/store.ts`、`packages/internal/database/src/services/subscription.ts`、`apps/desktop/layer/renderer/src/lib/subscription-unsubscribe-local-delete.test.ts`

2. ~~刷新页面会导致应用的页面闪白一下，这个对用户的感知非常不好，需要做到不影响用户的使用，做到无感知刷新。~~
   修复方式：列表 id 推导从“加载中直接清空”改为“有缓存数据时保持显示”，避免刷新瞬间把列表置空导致闪白。  
   改动范围：`packages/internal/store/src/modules/entry/hooks.ts`、`apps/desktop/layer/renderer/src/lib/entries-ids-stability.test.ts`

3. ~~之前有一个收藏的功能，收藏的文章会在收藏夹中显示，但是现在不支持收藏文章了，我找不到入口，需要支持这个功能。~~
   修复方式：恢复收藏入口（取消登录门槛），并将收藏/取消收藏写操作改为本地模式下只走本地存储，不再调用远端收藏接口。  
   改动范围：`apps/desktop/layer/renderer/src/hooks/biz/useEntryActions.tsx`、`packages/internal/store/src/modules/collection/store.ts`、`apps/desktop/layer/renderer/src/lib/collection-local-mode.test.ts`

4. ~~订阅的视图分类中， 图片和视频的分类可以删除掉了，相关的逻辑也可以去掉，本地rss不计划支持这些类型。~~
   修复方式：新增本地 RSS 视图白名单工具，统一过滤 `Pictures/Videos`，并替换订阅相关入口的视图来源，避免漏改。  
   改动范围：`apps/desktop/layer/renderer/src/lib/local-views.ts`、`apps/desktop/layer/renderer/src/hooks/biz/useTimelineList.ts`、`apps/desktop/layer/renderer/src/modules/feed/view-select-content.tsx`、`apps/desktop/layer/renderer/src/modules/subscription-column/FeedItem.tsx`、`apps/desktop/layer/renderer/src/modules/subscription-column/FeedCategory.tsx`、`apps/desktop/layer/renderer/src/modules/settings/tabs/feeds.tsx`、`apps/desktop/layer/renderer/src/modules/trending/index.tsx`、`apps/desktop/layer/renderer/src/lib/local-views.test.ts`

5. ~~收藏了，当时现在收藏的入口只能通过右键再点击收藏，应该需要一个更加快捷的收藏按钮才对。且收藏了之后再订阅列表页的收藏目录下并没有出现这个条目。~~
   修复方式：新增详情头部“快捷收藏按钮”（独立于右键菜单），并将收藏目录条目来源改为“全收藏集合”，不再按当前 view 过滤。  
   改动范围：`apps/desktop/layer/renderer/src/modules/entry-content/components/entry-header/internal/EntryHeaderActionsContainer.tsx`、`apps/desktop/layer/renderer/src/modules/entry-content/actions/header-actions.tsx`、`packages/internal/store/src/modules/collection/hooks.ts`、`packages/internal/store/src/modules/collection/hooks.test.ts`

6. ~~Dock图标显示未读数 这个功能是不是还没有实现？~~
   修复方式：应用内分类 Dock 的未读数改为基于条目读状态实时计算（按 view 的 entry 集合统计），不再依赖订阅累计值，确保“标记已读/未读”后立即刷新。  
   改动范围：`apps/desktop/layer/renderer/src/modules/subscription-column/SubscriptionTabButton.tsx`、`apps/desktop/layer/renderer/src/lib/unread-by-view.ts`、`apps/desktop/layer/renderer/src/lib/unread-by-view.test.ts`

7. ~~同一个网站的订阅应该只有一个才对。现在一个网站的rss可以重复的订阅。~~
   修复方式：在主进程 `db.addFeed` 增加订阅去重（规范化 feed URL + 站点 host 双重判定）；命中重复时复用已有 feed/subscription 并返回本地条目，不再创建重复订阅。  
   改动范围：`apps/desktop/layer/main/src/ipc/services/db.ts`、`apps/desktop/layer/main/src/ipc/services/rss-dedup.ts`、`apps/desktop/layer/main/src/ipc/services/rss-dedup.test.ts`

8. ~~设置 - 集成 - 通用 中 将AI总结保存为描述、使用浏览器发送请求 这些选项可以去掉了。~~
   修复方式：移除集成-通用下两项配置入口及其关联逻辑，仅保留“当前无可配置项”提示。  
   改动范围：`apps/desktop/layer/renderer/src/modules/settings/tabs/integration/index.tsx`

9. ~~刷新按钮当前的功能是什么样子的？ 他的实现是什么样子的？ 我目前看不出来这个按钮有什么用。~~
   修复方式：明确刷新逻辑并增强本地模式能力：原逻辑仅触发 timeline 查询 `refetch`（远端数据场景明显，本地场景感知弱）；现已新增主进程 `db.refreshFeed`，在本地 feed 上点击刷新会重新抓取 RSS、写入本地库并回刷列表。  
   改动范围：`apps/desktop/layer/main/src/ipc/services/db.ts`、`apps/desktop/layer/main/src/ipc/services/rss-refresh.ts`、`apps/desktop/layer/main/src/ipc/services/rss-refresh.test.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/layouts/EntryListHeader.tsx`

10. ~~社交媒体那个tab的栏目下面有 详情头部“快捷收藏按钮” 了，但是全部和文章这两个 tab 有吗？ 这个都需要加一下。~~
    修复方式：在非宽屏视图（如“全部/文章”）的列表头动作区补充快捷收藏按钮（基于当前选中 entry），与详情头能力对齐。  
    改动范围：`apps/desktop/layer/renderer/src/modules/entry-column/layouts/EntryListHeader.tsx`

11. ~~收藏的栏位下还是没有我收藏的文章。。。~~
    修复方式：修正 entries 查询选择策略，收藏页强制使用本地查询，不再被 `remoteQuery` 空结果覆盖。  
    改动范围：`apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/query-selection.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/query-selection.test.ts`

12. ~~设置 - 集成 - 通用 这个通用的栏位也可以不用了，只需要暴露内部集成等栏位就好了。~~
    修复方式：移除“通用”整块区块，仅保留内置集成与自定义集成内容。  
    改动范围：`apps/desktop/layer/renderer/src/modules/settings/tabs/integration/index.tsx`

13. ~~订阅列表如果该订阅有未读的文章的时候也需要加一个黄点提示，标识有未读文章。~~
    修复方式：统一未读组件渲染，存在未读时始终显示黄色点；在“显示未读数”模式下同时展示数字。  
    改动范围：`apps/desktop/layer/renderer/src/modules/subscription-column/UnreadNumber.tsx`

14. ~~点击用户头像，个人资料这个界面和入口都可以去掉了，现在本地应用不需要这些功能。~~
    修复方式：移除头像下拉菜单中的“个人资料”入口，并移除 handle 的二级展示，仅保留本地显示名。  
    改动范围：`apps/desktop/layer/renderer/src/modules/user/ProfileButton.tsx`、`apps/desktop/layer/renderer/src/modules/user/UserAvatar.tsx`

15. ~~点击用户头像，展示的用户名称应该是设置中设置的显示名称。 显示名称这个字段需要保存数据库的。当前应该是只保存到了内存，刷新之后又变回来了。 然后唯一标识的这个字段不需要了，唯一用户不需要唯一标识。也不需要展示邮箱地址了。~~
    修复方式：新增本地资料 payload 映射并改为走本地 `userSyncService.updateProfile`；`whoami()` 读取已持久化本地用户覆盖默认值，确保刷新后显示名不回退；设置页移除邮箱/账号管理区块与 handle 编辑入口。  
    改动范围：`apps/desktop/layer/renderer/src/lib/profile-payload.ts`、`apps/desktop/layer/renderer/src/modules/profile/profile-setting-form.tsx`、`apps/desktop/layer/renderer/src/pages/settings/(settings)/profile.tsx`、`packages/internal/store/src/modules/user/store.ts`、`apps/desktop/layer/renderer/src/lib/local-whoami.test.ts`、`apps/desktop/layer/renderer/src/lib/profile-payload.test.ts`

16. ~~当前应用的名称已经调整了，从 Folo 或者 Follow 修改成为 FreeFolo, 项目中涉及应用名称的地方都需要调整。~~
    修复方式：统一桌面端打包名/运行名/主要文案为 `FreeFolo`，并同步更新相关 User-Agent 与元信息。  
    改动范围：`apps/desktop/package.json`、`apps/desktop/forge.config.cts`、`apps/desktop/layer/renderer/global.d.ts`、`apps/desktop/vite.config.ts`、`apps/desktop/layer/main/src/before-bootstrap.ts`、`apps/desktop/layer/main/src/ipc/services/db.ts`、`apps/desktop/layer/main/src/lib/api-client.ts`、`apps/desktop/layer/main/package.json`、`apps/desktop/layer/renderer/index.html`、`apps/desktop/layer/renderer/src/components/common/SharePanel.tsx`、`apps/desktop/layer/renderer/src/modules/download/index.tsx`、`apps/desktop/layer/renderer/src/pages/(main)/(layer)/(subview)/rsshub/index.tsx`、`apps/desktop/layer/renderer/src/lib/freefolo-branding.test.ts`

17. ~~我把应用最小化了，但是过一段时间他自动刷新之后就会重新出现在我的窗口最前端，而且现在刷新还是会整个程序白一下，刷新应该是发生在后台的，不能影响用户的正常使用才对。~~
    修复方式：将主窗口 `readyToShowMainWindow` 收敛为“仅首次渲染可见化”，避免自动刷新/重载后重复 `show()` 抢前台；同时禁用 Electron 环境下动态模块错误自动 `window.location.reload()`，避免整窗白屏闪烁，改为保留错误页由用户主动操作。  
    改动范围：`apps/desktop/layer/main/src/ipc/services/app.ts`、`apps/desktop/layer/main/src/ipc/services/ready-to-show.ts`、`apps/desktop/layer/main/src/ipc/services/ready-to-show.test.ts`、`apps/desktop/layer/renderer/src/components/common/ErrorElement.tsx`、`apps/desktop/layer/renderer/src/lib/error-auto-reload.ts`、`apps/desktop/layer/renderer/src/lib/error-auto-reload.test.ts`

18. ~~收藏的按钮，能不能不要放在文章列表栏位里，而是放在文章详情的右上方？ 这样更符合直觉。且收藏的文章不管是不是仅显示未读状态，都全部展示，因为我只有读了才知道是值得收藏的。~~
    修复方式：移除文章列表头部的收藏快捷按钮；将收藏页的未读过滤逻辑改为忽略 `unreadOnly`；并补齐两个收藏入口：文章详情标题区右上角收藏按钮 + 文章列表每条记录右侧可点击收藏状态按钮（收藏/取消收藏）。  
    改动范围：`apps/desktop/layer/renderer/src/modules/entry-column/layouts/EntryListHeader.tsx`、`apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-list-header-actions.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/query-selection.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/useLocalEntries.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/query-selection.unread-collection.test.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-list-header-actions.test.ts`、`apps/desktop/layer/renderer/src/modules/entry-content/components/EntryTitle.tsx`、`apps/desktop/layer/renderer/src/modules/entry-column/components/EntryStarToggleButton.tsx`、`apps/desktop/layer/renderer/src/modules/entry-column/templates/list-item-template.tsx`、`apps/desktop/layer/renderer/src/modules/entry-column/Items/all-item.tsx`、`apps/desktop/layer/renderer/src/modules/entry-column/Items/social-media-item.tsx`

19. ~~订阅列表上的未读数量没有实时的随着真实未读数变化，当我点击 标记 以上 为已读的时候，记录变成了已读，但是订阅栏位上的未读数量没有变化~~  
    修复方式：修正本地模式下“带时间范围的批量已读”未读计数同步逻辑，按受影响条目（feedId/inboxHandle）实时扣减 `UnreadStore`，不再只改 entry `read` 状态。  
    改动范围：`packages/internal/store/src/modules/unread/store.ts`、`packages/internal/store/src/modules/unread/local-unread.ts`

20. ~~我点击刷新按钮会重新拉取新的数据入库吗？ 但是这个逻辑好像没有判重的逻辑，导致我刷新一下，文章列表对于重复数据就会增加一条。~~  
    修复方式：刷新写入改为稳定条目 ID（`feedId + guid/url/title+publishedAt` 哈希）并在 refresh 前按同一身份键复用库内已有 entry id，避免每次刷新新增重复条目。  
    改动范围：`apps/desktop/layer/main/src/ipc/services/rss-refresh.ts`、`apps/desktop/layer/main/src/ipc/services/db.ts`、`apps/desktop/layer/main/src/ipc/services/rss-refresh-entry-id.test.ts`

21. ~~应用的在系统中的图标上不要展示未读的数量，或者通过一个设置选项来决定是否展示未读数量。~~  
    修复方式：将系统图标未读徽标默认值改为关闭，并移除 renderer 端远端未读轮询依赖；仍保留设置项可手动开启。  
    改动范围：`packages/internal/shared/src/settings/defaults.ts`、`apps/desktop/layer/renderer/src/providers/setting-sync.tsx`

22. 播放文本转语言目前会报错，看起来也是调用了外部接口，这个功能你看一下能否本地实现？  
    评估结论（仅评估，暂不实现）：可以本地化，推荐三档方案。

- A. 系统 TTS（推荐）：macOS `say` / Web Speech API，离线可用，开发成本最低；音色和可控性一般。
- B. 本地模型推理：如 Piper/Coqui，本地完全离线、可定制；包体和资源占用明显增加。
- C. 混合模式：默认系统 TTS，保留可选在线高质量通道；复杂度最高但体验最平衡。
- 约束：若目标是“完全本地 RSS”，建议优先 A，后续按需要升级到 B。

23. ~~文章详情页的收藏按钮旁再加一个未读/已读的切换按钮。~~  
    修复方式：在文章详情标题区右上角新增 `entry.read` 切换按钮，与收藏按钮并排；点击后复用本地已读状态命令。  
    改动范围：`apps/desktop/layer/renderer/src/modules/entry-content/components/EntryTitle.tsx`

24. ~~文章列表页面，如果文章标题很长，我会看不到收藏按钮，但是文章的日志却是固定在右侧的，把收藏按钮也和时间一样固定在右侧。文章列表不需要额外展示正文内容。~~  
    修复方式：文章列表改为右侧固定动作列（时间 + 收藏按钮），收藏不再跟随标题流式布局；文章视图项改为 `simple` 模式，仅展示标题，不再展示正文摘要。  
    改动范围：`apps/desktop/layer/renderer/src/modules/entry-column/templates/list-item-template.tsx`、`apps/desktop/layer/renderer/src/modules/entry-column/Items/article-item.tsx`

25. ~~订阅栏位上的未读数量和分类 Dock 上的未读数量不一致，标记已读后不会同步变化。~~  
    修复方式：订阅栏位与分类分组的未读显示改为统一从 `EntryStore` 实时推导（feed/list/inbox 同一计数模型），不再依赖 `UnreadStore` 展示层，确保与分类 Dock 视图计数一致。  
    改动范围：`apps/desktop/layer/renderer/src/lib/unread-by-source.ts`、`apps/desktop/layer/renderer/src/lib/unread-by-source.test.ts`、`apps/desktop/layer/renderer/src/modules/subscription-column/FeedItem.tsx`、`apps/desktop/layer/renderer/src/modules/subscription-column/FeedCategory.tsx`

26. ~~第24条只改到了“文章”Tab，“全部”和“社交媒体”Tab 仍未实现“右侧固定收藏按钮 + 不展示正文摘要”。~~  
    修复方式：将 `All` 与 `SocialMedia` 列表项统一为右侧固定动作列（时间+收藏），并移除列表正文内容块，仅保留标题/来源信息。  
    改动范围：`apps/desktop/layer/renderer/src/modules/entry-column/Items/all-item.tsx`、`apps/desktop/layer/renderer/src/modules/entry-column/Items/social-media-item.tsx`

27. ~~切换 tab 时，如果当前 tab 下有订阅，文章列表应该要展示对应的列表数据，现在切换之后显示没有内容，但是当点击某个订阅的话，有会显示文章列表了，这和常理是相悖的。~~  
    修复方式：Tab 切换导航统一清空 `feedId/entryId`，避免沿用上一个 tab 的订阅路由参数导致新 tab 列表误为空。  
    改动范围：`apps/desktop/layer/renderer/src/modules/subscription-column/index.tsx`、`apps/desktop/layer/renderer/src/modules/subscription-column/timeline-switch.ts`、`apps/desktop/layer/renderer/src/modules/subscription-column/timeline-switch.test.ts`
    补充修复（2026-02-26）：将 `ROUTE_FEED_PENDING` 在 entries 查询参数中归一化为 `undefined`，避免被当作真实 feedId 导致查询空结果覆盖。  
    补充改动范围：`apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/query-selection.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/hooks/query-selection.test.ts`
    补充修复（2026-02-26 第二次）：修复“新增订阅后切 tab 9 条变 18 条”重复问题，对 entries 查询链路增加三层去重（`feedIds` 入参去重、本地 `fetchEntries` 合并结果按 `entry.id` 去重、最终 `entriesIds` 去重），并修正 `getEntryIdsByFeedIdsSelector` 的重复 `feedIds` 场景。  
    补充改动范围：`packages/internal/store/src/modules/entry/store.ts`、`packages/internal/store/src/modules/entry/hooks.ts`、`packages/internal/store/src/modules/entry/getter.ts`、`packages/internal/store/src/modules/entry/hooks.test.ts`、`packages/internal/store/src/modules/entry/getter.test.ts`、`packages/internal/store/vitest.config.ts`

28. ~~我刷新一下之后所有的已读状态又变成了未读~~  
    修复方式：刷新入库时按条目身份键（guid/url/title+publishedAt）复用既有条目，并继承已有 `read` 状态，避免刷新把已读覆盖回未读。  
    改动范围：`apps/desktop/layer/main/src/ipc/services/db.ts`、`apps/desktop/layer/main/src/ipc/services/rss-refresh.ts`、`apps/desktop/layer/main/src/ipc/services/rss-refresh-entry-id.test.ts`

29. ~~另外在全部 tab 下我点击一下某个订阅，文章列表的样式又没有和文章tab的样式一致了~~  
    修复方式：将 `All` 视图列表项映射到文章样式组件（与 `Articles` 统一），并同步骨架屏映射。  
    改动范围：`apps/desktop/layer/renderer/src/modules/entry-column/Items/getItemComponentByView.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/Items/getSkeletonItemComponentByView.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/Items/view-style.ts`、`apps/desktop/layer/renderer/src/modules/entry-column/Items/view-style.test.ts`

30. ~~在每个tab下面，比如全部，有个全部标题， 文章有个文章标题，他的右边也展示了一个未读的数量，这个数量的取值逻辑好像有问题，和tab图标下面的未读数量对不上。~~  
    修复方式：将标题右侧未读数改为与 tab 图标一致的数据源（`EntryStore + view` 统计），不再走 `UnreadStore` 口径，确保同视图下两处数字一致。  
    改动范围：`apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/ListHeader.tsx`、`apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/unread-count.ts`、`apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/unread-count.test.ts`

31. ~~当前右键订阅的时候有一个全部已读的选择，这个选择会有全部未读的可能吗？ 如果没有的话加一个功能，如果订阅下面的所有文章都变成已读了，这个选择变成全部未读，点击之后将订阅之下的文章状态变成全部未读。~~  
    修复方式：订阅右键菜单改为双态动作（根据实时未读数自动在“全部已读/全部未读”间切换）；当目标订阅/列表/分类下未读数为 0 时，点击执行本地 `markFeedAsUnread/markListAsUnread`，将对应条目标记为未读并同步未读计数。  
    改动范围：`apps/desktop/layer/renderer/src/hooks/biz/useFeedActions.tsx`、`apps/desktop/layer/renderer/src/hooks/biz/mark-all-toggle.ts`、`apps/desktop/layer/renderer/src/hooks/biz/mark-all-toggle.test.ts`、`apps/desktop/layer/renderer/src/modules/subscription-column/FeedCategory.tsx`、`packages/internal/store/src/modules/unread/store.ts`、`packages/internal/store/src/modules/unread/local-unread.ts`、`packages/internal/store/src/modules/unread/local-unread.test.ts`、`locales/app/en.json`、`locales/app/zh-CN.json`、`locales/app/zh-TW.json`、`locales/app/fr-FR.json`、`locales/app/ja.json`

32. ~~如果右键全部未读之后点击订阅-仅显示未读时没有展示记录~~  
    修复方式：在批量标记已读/未读完成后统一触发 entries 查询失效，强制 `unreadOnly` 列表重新拉取并按最新 `read` 状态重算，避免仍使用旧缓存导致“仅显示未读为空”。  
    改动范围：`packages/internal/store/src/modules/unread/store.ts`、`packages/internal/store/src/modules/unread/invalidate-entries.ts`、`packages/internal/store/src/modules/unread/invalidate-entries.test.ts`
    补充修复（2026-02-26）：将失效策略改为直接失效 `queryKey=["entries"]`；此前调用 `invalidateEntriesQuery({})` 不会命中任何查询，导致列表不刷新。  
    补充改动范围：`packages/internal/store/src/modules/unread/invalidate-entries.ts`、`packages/internal/store/src/modules/unread/invalidate-entries.test.ts`

33. ~~全部 Tab 未读数量与文章 Tab 明显不一致（示例：文章 17、全部 39），口径异常。~~  
    修复方式：`All/Articles` 未读统计改为“按当前有效订阅来源聚合”而非直接使用 `entryIdByView` 索引，避免把已取消订阅或陈旧来源条目计入。统计时按 `feedId/inboxId` 取条目并对条目 ID 去重后再计算未读。  
    改动范围：`apps/desktop/layer/renderer/src/lib/unread-by-view.ts`、`apps/desktop/layer/renderer/src/lib/unread-by-view.test.ts`、`apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/unread-count.test.ts`

34. ~~设置里的 列表 菜单可以删掉了，本地RSS不需要相关的分享功能~~
    修复方式：移除设置中的 `列表(List)` 菜单入口及其对应的页面模块（本地RSS无需社交/列表相关功能）。  
    改动范围：`apps/desktop/layer/renderer/src/pages/settings/(settings)/list.tsx`、`apps/desktop/layer/renderer/src/modules/settings/tabs/lists`

35. ~~添加订阅源的发现页面有三个tab，分别是 搜索，RSS，RSShub， 我这里只要保留RSS 和 RSShub, 搜索的逻辑删掉吧， 另外还有个 Or go to Discover.... 的一段话，也删除掉。再确认一下 RSSHub 的逻辑当前有实现吗？~~
    修复方式：将 `SimpleDiscoverModal` 收敛为仅 `RSS/RSSHub` 两种模式，移除搜索模式及其发现搜索结果链路，同时删除 “Or go to Discover...” 引导文案。`RSSHub` 逻辑仍已实现：输入 `rsshub://` 路由后仍会走 `FeedForm` 预览与订阅流程。  
    改动范围：`apps/desktop/layer/renderer/src/modules/subscription-column/SimpleDiscoverModal.tsx`、`apps/desktop/layer/renderer/src/modules/subscription-column/simple-discover-options.ts`、`apps/desktop/layer/renderer/src/modules/subscription-column/simple-discover-options.test.ts`

36. ~~设置 - 订阅源， 设置 - 列表， 设置-通知，这三个页面删除掉。对应的逻辑也可以剔除了。~~
    修复方式：物理删除三页路由文件（`feeds/list/notifications`），并在设置可见性过滤中加入本地隐藏规则，防止后续页面回流时再次暴露。  
    改动范围：`apps/desktop/layer/renderer/src/pages/settings/(settings)/feeds.tsx`、`apps/desktop/layer/renderer/src/pages/settings/(settings)/list.tsx`、`apps/desktop/layer/renderer/src/pages/settings/(settings)/notifications.tsx`、`apps/desktop/layer/renderer/src/modules/settings/local-hidden-settings.ts`、`apps/desktop/layer/renderer/src/modules/settings/hooks/use-setting-ctx.ts`、`apps/desktop/layer/renderer/src/modules/settings/local-hidden-settings.test.ts`

37. ~~设置-外观-隐藏徽章 按钮删除。 通用-tss这恶搞配置删除掉，通用-网络，代理 配置删除掉。~~  
    修复方式：设置页外观已移除“隐藏徽章”开关；设置页通用已移除 `TTS` 配置块与“网络/代理”配置块，仅保留本地 RSS 必需项。  
    改动范围：`apps/desktop/layer/renderer/src/modules/settings/tabs/appearance.tsx`、`apps/desktop/layer/renderer/src/modules/settings/tabs/general.tsx`

38. ~~设置-通用 标记已读选项，默认选择为：单项内容进入视图时， 这些内设置信息都要持久化落库。~~  
    修复方式：将默认策略调整为 `renderMarkUnread=true`、`scrollMarkUnread=false`（即“单项内容进入视图时”）；并加入一次性迁移逻辑，仅对未改过设置的旧默认用户执行迁移，设置仍通过本地 settings store 持久化。  
    改动范围：`packages/internal/shared/src/settings/defaults.ts`、`apps/desktop/layer/renderer/src/atoms/settings/general.ts`、`apps/desktop/layer/renderer/src/lib/mark-read-defaults.test.ts`

39. ~~点击头像弹出的界面，有个登出按钮，这个按钮删除掉。~~  
    修复方式：头像下拉菜单移除“登出”入口及对应 `signOut` 调用。  
    改动范围：`apps/desktop/layer/renderer/src/modules/user/ProfileButton.tsx`

40. ~~打包成app 后，内置RSSHUB启动失败。~~  
    修复方式：增强内置 RSSHub 运行时上下文识别逻辑；当缺失 `electron app` 上下文和 `ELECTRON_IS_PACKAGED` 环境变量时，按路径特征兜底识别打包态，避免错误走开发路径导致入口脚本定位失败。  
    改动范围：`apps/desktop/layer/main/src/manager/rsshub.ts`、`apps/desktop/layer/main/src/manager/rsshub.test.ts`
