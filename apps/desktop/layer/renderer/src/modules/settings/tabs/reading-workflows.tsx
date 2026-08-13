import { Button } from "@suhui/components/ui/button/index.js"
import { Input } from "@suhui/components/ui/input/Input.js"
import { runtimeClient } from "@suhui/store/runtime"
import { useEffect, useState } from "react"
import { toast } from "sonner"

type Rule = {
  id: string
  name: string
  enabled: boolean
  feedIds: string[]
  titleKeywords: string[]
  actions: {
    markRead?: boolean
    star?: boolean
    addToReadingQueue?: boolean
    hide?: boolean
    tags?: string[]
  }
}

type QueueItem = {
  entryId: string
  status: "pending" | "completed"
  completedAt: number | null
  entry: { title?: string | null; url?: string | null } | null
}

export function SettingReadingWorkflows() {
  const [rules, setRules] = useState<Rule[]>([])
  const [name, setName] = useState("")
  const [feedIds, setFeedIds] = useState("")
  const [keywords, setKeywords] = useState("")
  const [tags, setTags] = useState("")
  const [markRead, setMarkRead] = useState(false)
  const [star, setStar] = useState(false)
  const [queue, setQueue] = useState(false)
  const [hide, setHide] = useState(false)
  const [queueStats, setQueueStats] = useState<any>(null)
  const [pendingQueue, setPendingQueue] = useState<QueueItem[]>([])
  const [completedQueue, setCompletedQueue] = useState<QueueItem[]>([])
  const [rebuildingClusters, setRebuildingClusters] = useState(false)

  const refresh = async () => {
    const [nextRules, stats, pending, completed] = await Promise.all([
      runtimeClient.rules.list(),
      runtimeClient.readingQueue.stats(),
      runtimeClient.readingQueue.list("pending", 100),
      runtimeClient.readingQueue.list("completed", 100),
    ])
    setRules((nextRules ?? []) as Rule[])
    setQueueStats(stats)
    setPendingQueue((pending ?? []) as QueueItem[])
    setCompletedQueue((completed ?? []) as QueueItem[])
  }

  useEffect(() => {
    void refresh()
  }, [])

  const createRule = async () => {
    await runtimeClient.rules.create({
      name,
      enabled: true,
      feedIds: feedIds.split(","),
      titleKeywords: keywords.split(","),
      actions: { markRead, star, addToReadingQueue: queue, hide, tags: tags.split(",") },
    })
    setName("")
    await refresh()
    toast.success("规则已创建；默认只处理后续新文章")
  }

  const previewHistory = async (rule: Rule) => {
    const preview = (await runtimeClient.rules.previewHistory(rule.id)) as {
      token: string
      matchCount: number
    }
    if (!window.confirm(`历史文章将命中 ${preview.matchCount} 篇。确认执行？`)) return
    await runtimeClient.rules.executeHistory(preview.token)
    toast.success("历史规则已执行")
  }

  const toggleRule = async (rule: Rule) => {
    await runtimeClient.rules.update(rule.id, { ...rule, enabled: !rule.enabled })
    await refresh()
    toast.success(rule.enabled ? "规则已停用" : "规则已启用")
  }

  const rebuildClusters = async () => {
    setRebuildingClusters(true)
    try {
      const result = await runtimeClient.clusters.rebuild()
      toast.success(
        `重复文章聚类已重建：处理 ${result?.processed ?? 0} 篇，聚类 ${result?.clustered ?? 0} 篇`,
      )
    } finally {
      setRebuildingClusters(false)
    }
  }

  return (
    <div className="mt-4 space-y-6">
      <section className="rounded-xl border border-border p-4">
        <h3 className="font-medium">重复文章聚类</h3>
        <p className="mt-1 text-sm text-text-secondary">
          分批扫描既有文章并恢复重复来源折叠；中断后再次执行会从上次进度继续。
        </p>
        <Button
          className="mt-3"
          disabled={rebuildingClusters}
          onClick={() => void rebuildClusters()}
        >
          {rebuildingClusters ? "正在重建…" : "重建历史聚类"}
        </Button>
      </section>

      <section className="rounded-xl border border-border p-4">
        <h3 className="font-medium">阅读队列</h3>
        <p className="mt-1 text-sm text-text-secondary">
          待阅读 {queueStats?.pending ?? 0}；近 7 天完成 {queueStats?.completed7Days ?? 0}；近 30
          天完成 {queueStats?.completed30Days ?? 0}。
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <QueueList
            title="待阅读"
            items={pendingQueue}
            actions={(item) => (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void runtimeClient.readingQueue.complete(item.entryId).then(refresh)
                  }
                >
                  完成
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void runtimeClient.readingQueue.remove(item.entryId).then(refresh)}
                >
                  移除
                </Button>
              </>
            )}
          />
          <QueueList
            title="完成记录"
            items={completedQueue}
            actions={(item) => (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runtimeClient.readingQueue.add(item.entryId).then(refresh)}
                >
                  重新加入
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void runtimeClient.readingQueue.remove(item.entryId).then(refresh)}
                >
                  移除记录
                </Button>
              </>
            )}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border p-4">
        <h3 className="font-medium">新建文章规则</h3>
        <p className="mt-1 text-sm text-text-secondary">
          来源和标题关键词两组之间为 AND，组内为 OR；逗号分隔。创建规则不会改写历史文章。
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="规则名称"
          />
          <Input
            value={feedIds}
            onChange={(event) => setFeedIds(event.target.value)}
            placeholder="来源 feed ID"
          />
          <Input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="标题关键词"
          />
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="文章标签"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {[
            ["自动已读", markRead, setMarkRead],
            ["自动加星", star, setStar],
            ["加入稍后读", queue, setQueue],
            ["隐藏", hide, setHide],
          ].map(([label, checked, setter]) => (
            <label className="flex items-center gap-2" key={label as string}>
              <input
                type="checkbox"
                checked={checked as boolean}
                onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
              />
              {label as string}
            </label>
          ))}
        </div>
        <div className="mt-4">
          <Button onClick={() => void createRule()}>创建规则</Button>
        </div>
      </section>

      <section className="space-y-2">
        {rules.map((rule) => (
          <div
            className="flex items-center justify-between rounded-xl border border-border p-3"
            key={rule.id}
          >
            <div>
              <div className="font-medium">{rule.name}</div>
              <div className="text-xs text-text-secondary">
                {rule.titleKeywords.join("、") || "任意标题"} · {rule.enabled ? "启用" : "停用"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void toggleRule(rule)}>
                {rule.enabled ? "停用" : "启用"}
              </Button>
              <Button variant="outline" onClick={() => void previewHistory(rule)}>
                预览并应用历史
              </Button>
              <Button
                variant="outline"
                onClick={() => void runtimeClient.rules.delete(rule.id).then(() => refresh())}
              >
                删除
              </Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function QueueList({
  title,
  items,
  actions,
}: {
  title: string
  items: QueueItem[]
  actions: (item: QueueItem) => React.ReactNode
}) {
  return (
    <div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 max-h-72 space-y-2 overflow-auto">
        {items.length === 0 ? (
          <div className="text-xs text-text-secondary">暂无条目</div>
        ) : (
          items.map((item) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg bg-material-thin p-2"
              key={item.entryId}
            >
              <div className="min-w-0 truncate text-sm">
                {item.entry?.title || item.entry?.url || item.entryId}
              </div>
              <div className="flex shrink-0 gap-1">{actions(item)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
