import { Button } from "@suhui/components/ui/button/index.js"
import { FeedViewType } from "@suhui/constants"
import type { AnnotationKind, AnnotationLibraryCursor } from "@suhui/shared/annotations"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"

import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { localReadingIpc } from "~/lib/local-reading-ipc"
import { useSubViewTitle } from "~/modules/app-layout/subview/hooks"

const filters = [
  { kind: undefined, label: "全部" },
  { kind: "note", label: "笔记" },
  { kind: "highlight", label: "高亮" },
] as const

export function AnnotationLibraryPage() {
  useSubViewTitle("笔记与高亮", "笔记与高亮")
  const [kind, setKind] = useState<AnnotationKind>()
  const navigateEntry = useNavigateEntry()
  const query = useInfiniteQuery({
    queryKey: ["annotation-library", kind],
    initialPageParam: undefined as AnnotationLibraryCursor | undefined,
    queryFn: ({ pageParam }) => {
      const ipc = localReadingIpc()
      if (!ipc) throw new Error("请在桌面端查看笔记与高亮")
      return ipc.listAnnotationLibrary({ kind, cursor: pageParam, limit: 50 })
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
    retry: false,
  })
  const items = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 pb-8">
      <header>
        <h1 className="text-2xl font-semibold text-text">笔记与高亮</h1>
        <p className="mt-2 text-sm text-text-secondary">
          回顾阅读时留下的想法与摘录，按最近更新排序。
        </p>
      </header>

      <div className="flex items-center justify-between gap-4">
        <div
          className="flex gap-1 rounded-lg bg-fill-quaternary p-1"
          role="group"
          aria-label="记录类型"
        >
          {filters.map((filter) => (
            <Button
              key={filter.label}
              size="sm"
              variant={kind === filter.kind ? "primary" : "ghost"}
              aria-pressed={kind === filter.kind}
              onClick={() => setKind(filter.kind)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          刷新
        </Button>
      </div>

      {query.isPending && (
        <p role="status" className="py-12 text-center text-text-secondary">
          正在加载记录…
        </p>
      )}

      {query.isError && (
        <div role="alert" className="space-y-3 rounded-xl border border-border p-5">
          <p className="font-medium">笔记与高亮加载失败</p>
          <p className="select-text break-words text-sm text-text-secondary">
            {query.error.message}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetching}
            onClick={() =>
              void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
            }
          >
            重新加载
          </Button>
        </div>
      )}

      {!query.isPending && !query.isError && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">
            {kind === "note"
              ? "还没有笔记"
              : kind === "highlight"
                ? "还没有高亮"
                : "还没有笔记或高亮"}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            在文章底部写下笔记，或选中文字添加高亮，之后都可以在这里找到。
          </p>
        </div>
      )}

      <ul className="space-y-4" aria-label="笔记与高亮记录">
        {items.map((item) => (
          <li
            key={`${item.kind}:${item.id}`}
            className="space-y-4 rounded-xl border border-border bg-material-thin p-5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="rounded bg-fill-quaternary px-2 py-1 text-text">
                {item.kind === "note" ? "笔记" : "高亮"}
              </span>
              <time dateTime={new Date(item.updatedAt).toISOString()}>
                {new Date(item.updatedAt).toLocaleString()}
              </time>
              {item.source && (
                <span>{item.source === "readability" ? "净化正文" : "RSS 正文"}</span>
              )}
              {item.status === "orphaned" && <span>原文已变化，锚点待确认</span>}
            </div>
            {item.kind === "highlight" ? (
              <blockquote className="select-text whitespace-pre-wrap break-words border-l-2 border-accent pl-4 text-sm leading-relaxed">
                {item.content}
              </blockquote>
            ) : (
              <p className="select-text whitespace-pre-wrap break-words text-sm leading-relaxed">
                {item.content}
              </p>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.articleId ? item.articleTitle || "无标题文章" : "文章已不可用"}
                </p>
                {item.feedTitle && (
                  <p className="mt-1 truncate text-xs text-text-secondary">{item.feedTitle}</p>
                )}
              </div>
              {item.articleId && (
                <Button
                  size="sm"
                  variant="ghost"
                  buttonClassName="shrink-0"
                  onClick={() =>
                    navigateEntry({
                      entryId: item.entryId,
                      feedId: item.feedId,
                      view: FeedViewType.Articles,
                      backPath: "/annotations",
                    })
                  }
                >
                  打开文章
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {items.length > 0 && (
        <div className="flex items-center justify-center gap-4 text-sm text-text-secondary">
          <span>已显示 {items.length} 条记录</span>
          {query.hasNextPage && !query.isFetchNextPageError && (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "正在加载…" : "加载更多"}
            </Button>
          )}
        </div>
      )}
    </main>
  )
}
