import { Button } from "@suhui/components/ui/button/index.js"
import { Input } from "@suhui/components/ui/input/Input.js"
import { TextArea } from "@suhui/components/ui/input/TextArea.js"
import { useEntry } from "@suhui/store/entry/hooks"
import type { EntryModel } from "@suhui/store/entry/types"
import { runtimeClient } from "@suhui/store/runtime"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

type Note = { id: string; content: string; updatedAt: number }
type Highlight = { id: string; quote: string; source: string; status: "active" | "orphaned" }

const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )

export function EntryAnnotationsPanel({ entryId }: { entryId: string }) {
  const currentEntryIdRef = useRef(entryId)
  currentEntryIdRef.current = entryId
  const entryState = useEntry(entryId, (entry) => ({
    cluster: entry.cluster,
    hidden: entry.hidden ?? false,
  }))
  const [notes, setNotes] = useState<Note[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [noteDraft, setNoteDraft] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState("")
  const [hidden, setHidden] = useState(false)
  const [clusterEntries, setClusterEntries] = useState<EntryModel[] | null>(null)

  const refresh = useCallback(async () => {
    const [annotations, nextTags] = await Promise.all([
      runtimeClient.annotations.list(entryId),
      runtimeClient.entryOrganization.tags(entryId),
    ])
    if (currentEntryIdRef.current !== entryId) return
    setNotes((annotations?.notes ?? []) as Note[])
    setHighlights((annotations?.highlights ?? []) as Highlight[])
    setTags((nextTags ?? []) as string[])
    setTagDraft(((nextTags ?? []) as string[]).join(", "))
  }, [entryId])

  useEffect(() => {
    setNotes([])
    setHighlights([])
    setTags([])
    setTagDraft("")
    setHidden(entryState?.hidden ?? false)
    setClusterEntries(null)
    void runtimeClient.annotations
      .relocate(entryId)
      .catch(() => undefined)
      .then(refresh)
  }, [entryId, entryState?.hidden, refresh])

  const addNote = async () => {
    if (!noteDraft.trim()) return
    await runtimeClient.annotations.createNote(entryId, noteDraft)
    setNoteDraft("")
    await refresh()
    toast.success("笔记已保存")
  }

  const saveTags = async () => {
    const next = parseTags(tagDraft)
    await runtimeClient.entryOrganization.updateTags(entryId, {
      add: next.filter((tag) => !tags.includes(tag)),
      remove: tags.filter((tag) => !next.includes(tag)),
    })
    await refresh()
    toast.success("文章标签已更新")
  }

  const toggleHidden = async () => {
    const next = !hidden
    await runtimeClient.entryOrganization.setHidden(entryId, next)
    setHidden(next)
    toast.success(next ? "文章已从普通列表隐藏" : "文章已取消隐藏")
  }

  const loadClusterEntries = async () => {
    const ids = entryState?.cluster?.entryIds ?? []
    const values = await Promise.all(ids.map((id) => runtimeClient.entries.getDetail(id)))
    setClusterEntries(values.filter((value): value is EntryModel => value !== null))
  }

  return (
    <aside className="mt-10 space-y-5 rounded-xl border border-border bg-material-thin p-4">
      <div>
        <div className="text-sm font-semibold">笔记与高亮</div>
        <p className="mt-1 text-xs text-text-secondary">
          笔记、高亮和文章标签都会进入本地搜索与完整备份。
        </p>
      </div>

      <div className="space-y-2">
        <TextArea
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          onCmdEnter={() => void addNote()}
          placeholder="记录这篇文章的想法（⌘/Ctrl + Enter 保存）"
          className="min-h-20"
        />
        <Button size="sm" onClick={() => void addNote()}>
          保存笔记
        </Button>
        {notes.map((note) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg bg-material-medium p-3 text-sm"
            key={note.id}
          >
            <div className="whitespace-pre-wrap break-words">{note.content}</div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const content = window.prompt("编辑笔记", note.content)?.trim()
                  if (!content || content === note.content) return
                  void runtimeClient.annotations
                    .updateNote(note.id, content, note.updatedAt)
                    .then(refresh)
                }}
              >
                编辑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void runtimeClient.annotations.deleteNote(note.id).then(refresh)}
              >
                删除
              </Button>
            </div>
          </div>
        ))}
        {highlights.map((highlight) => (
          <blockquote
            className="flex items-start justify-between gap-3 border-l-2 border-accent pl-3 text-sm"
            key={highlight.id}
          >
            <div>
              <div>“{highlight.quote}”</div>
              <div className="mt-1 text-xs text-text-secondary">
                {highlight.source === "readability" ? "净化正文" : "RSS 正文"}
                {highlight.status === "orphaned" ? " · 原文已变化，锚点待确认" : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void runtimeClient.annotations.deleteHighlight(highlight.id).then(refresh)
              }
            >
              删除
            </Button>
          </blockquote>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="text-sm font-medium">文章标签与可见性</div>
        <div className="flex gap-2">
          <Input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            placeholder="标签，以逗号分隔"
          />
          <Button variant="outline" onClick={() => void saveTags()}>
            保存标签
          </Button>
          <Button variant="outline" onClick={() => void toggleHidden()}>
            {hidden ? "取消隐藏" : "隐藏文章"}
          </Button>
        </div>
      </div>

      {entryState?.cluster && entryState.cluster.sourceCount > 1 ? (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-sm font-medium">重复来源（{entryState.cluster.sourceCount}）</div>
          {clusterEntries === null ? (
            <Button variant="outline" onClick={() => void loadClusterEntries()}>
              展开全部来源
            </Button>
          ) : (
            <div className="space-y-2">
              {clusterEntries.map((source) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={source.id}>
                  <div className="min-w-0 truncate">{source.title || source.url || source.id}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={source.id === entryState.cluster?.representativeEntryId}
                    onClick={() =>
                      void runtimeClient.clusters
                        .setRepresentative(entryState.cluster!.id, source.id)
                        .then(() => toast.success("代表文章已更新；重新载入列表后生效"))
                    }
                  >
                    {source.id === entryState.cluster?.representativeEntryId
                      ? "当前代表"
                      : "设为代表"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void runtimeClient.clusters
                        .splitMember(entryState.cluster!.id, source.id)
                        .then(() => toast.success("已拆分；重新载入列表后生效"))
                    }
                  >
                    拆分
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </aside>
  )
}
