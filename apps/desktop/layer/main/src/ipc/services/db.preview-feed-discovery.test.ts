import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchFeedUrl = vi.fn()
const buildPreviewDiagnostics = vi.fn()
const getEntryMany = vi.fn()
const readabilityMock = vi.fn()
const storeValues: Record<string, string> = {}

vi.mock("electron", () => ({
  session: { defaultSession: { resolveProxy: vi.fn(async () => "DIRECT") } },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}))

vi.mock("./feed-fetch", () => ({ fetchFeedUrl }))
vi.mock("@suhui/database/services/entry", () => ({
  EntryService: { getEntryMany, upsertMany: vi.fn(), patch: vi.fn(), patchMany: vi.fn() },
}))
vi.mock("@suhui/readability", () => ({ readability: readabilityMock }))
vi.mock("./preview-feed-diagnostics", () => ({ buildPreviewDiagnostics }))
vi.mock("~/lib/store", () => ({
  store: { get: vi.fn((key: string) => storeValues[key] ?? "") },
}))
vi.mock("~/manager/db", () => ({
  DBManager: { waitUntilUsable: vi.fn(), getDB: vi.fn(), getDialect: vi.fn() },
}))
vi.mock("~/manager/sync-applier", () => ({ drainPendingOps: vi.fn() }))
vi.mock("~/manager/sync-logger", () => ({ syncLogger: { record: vi.fn() } }))
vi.mock("~/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}))
vi.mock("~/manager/refresh-audit-log", () => ({ appendRefreshAuditTrace: vi.fn() }))
vi.mock("~/manager/local-feed-refresh-events", () => ({
  broadcastLocalFeedRefreshCompleted: vi.fn(),
}))

const atomFeed = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Blog</title><link href="https://blog.example.com/" rel="alternate"/>
  <entry><title>Entry 1</title><link href="https://blog.example.com/post/1" rel="alternate"/>
  <id>entry-1</id><updated>2026-04-08T00:00:00Z</updated><content type="html">hello</content></entry>
</feed>`

const advertisingPage = `<!doctype html><html><head><title>Example Blog</title>
  <link rel="alternate" type="application/atom+xml" href="/atom.xml"></head>
  <body><main><p>hello</p></main></body></html>`

const listingPage = `<!doctype html><html><head><title>Example Blog</title></head><body><main>
  <li class="p"><a href="/a/">First Real Article</a><time datetime="2026-01-03">x</time></li>
  <li class="p"><a href="/b/">Second Real Article</a><time datetime="2026-01-02">x</time></li>
  <li class="p"><a href="/c/">Third Real Article</a><time datetime="2026-01-01">x</time></li>
</main></body></html>`

/** Serves per-url bodies, mirroring fetchFeedUrl's contract. */
const serve = (routes: Record<string, { body: string; finalUrl?: string; contentType?: string }>) =>
  fetchFeedUrl.mockImplementation(async (url: string) => {
    const hit = routes[url]
    if (!hit) throw new Error("HTTP 404")
    return {
      body: hit.body,
      finalUrl: hit.finalUrl ?? url,
      redirectChain: [],
      statusCode: 200,
      contentType:
        hit.contentType ?? (hit.body.startsWith("<!doctype") ? "text/html" : "application/xml"),
    }
  })

const previewFeed = async (url: string, feedId?: string) => {
  const { DbService } = await import("./db")
  return new DbService().previewFeed({} as any, { url, feedId })
}

describe("previewFeed 的地址落库口径", () => {
  beforeEach(() => {
    fetchFeedUrl.mockReset()
    buildPreviewDiagnostics.mockReset()
    buildPreviewDiagnostics.mockResolvedValue({})
    getEntryMany.mockReset()
    getEntryMany.mockResolvedValue([])
    readabilityMock.mockReset()
    readabilityMock.mockResolvedValue({ content: "<p>full article body</p>" })
    for (const key of Object.keys(storeValues)) delete storeValues[key]
  })

  it("网页地址订阅时落库为发现到的订阅源地址", async () => {
    serve({
      "https://blog.example.com/": { body: advertisingPage },
      "https://blog.example.com/atom.xml": { body: atomFeed },
    })

    const preview = await previewFeed("https://blog.example.com/")

    expect(preview.feed.url).toBe("https://blog.example.com/atom.xml")
    expect(preview.sourceOptions.active.kind).toBe("feed")
  })

  it("直接填订阅源地址时原样落库，且不做任何探测", async () => {
    serve({ "https://blog.example.com/atom.xml": { body: atomFeed } })

    const preview = await previewFeed("https://blog.example.com/atom.xml")

    expect(preview.feed.url).toBe("https://blog.example.com/atom.xml")
    expect(fetchFeedUrl).toHaveBeenCalledTimes(1)
  })

  it("发生跳转时以最终地址为基准解析相对链接", async () => {
    serve({
      "https://t.co/abc123": { body: advertisingPage, finalUrl: "https://blog.example.com/" },
      "https://blog.example.com/atom.xml": { body: atomFeed },
    })

    const preview = await previewFeed("https://t.co/abc123")

    expect(preview.feed.url).toBe("https://blog.example.com/atom.xml")
  })

  it("发生跳转且只能抓取页面时，抓取目标是最终地址", async () => {
    serve({ "https://t.co/abc123": { body: listingPage, finalUrl: "https://blog.example.com/" } })

    const preview = await previewFeed("https://t.co/abc123")

    expect(preview.feed.url).toBe("sitescrape:https://blog.example.com/")
    expect(preview.entries.map((entry) => entry.url)).toEqual([
      "https://blog.example.com/a/",
      "https://blog.example.com/b/",
      "https://blog.example.com/c/",
    ])
  })

  it("rsshub 实例返回网页时报错，绝不把实例地址落库", async () => {
    storeValues.rsshubCustomUrl = "https://my-rsshub.local"
    serve({
      "https://my-rsshub.local/github/issue/vuejs/core": { body: advertisingPage },
      "https://my-rsshub.local/atom.xml": { body: atomFeed },
    })

    await expect(previewFeed("rsshub://github/issue/vuejs/core")).rejects.toThrow(
      /Unsupported feed format|Invalid feed XML/,
    )
    // only the instance route was requested; no candidate probing happened
    expect(fetchFeedUrl).toHaveBeenCalledTimes(1)
  })

  it("rsshub 地址正常返回订阅源时仍落库为 rsshub:// 原地址", async () => {
    storeValues.rsshubCustomUrl = "https://my-rsshub.local"
    serve({ "https://my-rsshub.local/github/issue/vuejs/core": { body: atomFeed } })

    const preview = await previewFeed("rsshub://github/issue/vuejs/core")

    expect(preview.feed.url).toBe("rsshub://github/issue/vuejs/core")
  })

  it("sitescrape 地址重新预览时再次抓取页面", async () => {
    serve({ "https://blog.example.com/": { body: listingPage } })

    const preview = await previewFeed("sitescrape:https://blog.example.com/")

    expect(preview.feed.url).toBe("sitescrape:https://blog.example.com/")
    expect(preview.entries).toHaveLength(3)
  })
})

describe("预览的默认 view 与来源无关", () => {
  beforeEach(() => {
    fetchFeedUrl.mockReset()
    buildPreviewDiagnostics.mockReset()
    buildPreviewDiagnostics.mockResolvedValue({})
    getEntryMany.mockReset()
    getEntryMany.mockResolvedValue([])
    readabilityMock.mockReset()
    readabilityMock.mockResolvedValue({ content: "<p>full article body</p>" })
    for (const key of Object.keys(storeValues)) delete storeValues[key]
  })

  // FeedViewType.Articles，不是 SocialMedia（后者 wideMode 会改变阅读布局并隐藏正文抓取）
  it.each([
    [
      "订阅源文档",
      "https://blog.example.com/atom.xml",
      { "https://blog.example.com/atom.xml": { body: atomFeed } },
    ],
    [
      "自动发现",
      "https://blog.example.com/",
      {
        "https://blog.example.com/": { body: advertisingPage },
        "https://blog.example.com/atom.xml": { body: atomFeed },
      },
    ],
    [
      "页面抓取",
      "https://blog.example.com/",
      { "https://blog.example.com/": { body: listingPage } },
    ],
    [
      "sitescrape 地址",
      "sitescrape:https://blog.example.com/",
      { "https://blog.example.com/": { body: listingPage } },
    ],
  ])("%s 的默认 view 都是 Articles(0)", async (_name, url, routes) => {
    serve(routes as any)

    const preview = await previewFeed(url)

    expect(preview.analytics.view).toBe(0)
  })
})

describe("抓取源的正文补全", () => {
  beforeEach(() => {
    fetchFeedUrl.mockReset()
    buildPreviewDiagnostics.mockReset()
    buildPreviewDiagnostics.mockResolvedValue({})
    getEntryMany.mockReset()
    getEntryMany.mockResolvedValue([])
    readabilityMock.mockReset()
    readabilityMock.mockResolvedValue({ content: "<p>full article body</p>" })
    for (const key of Object.keys(storeValues)) delete storeValues[key]
  })

  it("入库时取回全文，而不是只留列表页摘要", async () => {
    serve({ "https://blog.example.com/": { body: listingPage } })

    const preview = await previewFeed("https://blog.example.com/")

    expect(readabilityMock).toHaveBeenCalledTimes(3)
    expect(preview.entries.every((entry) => entry.content === "<p>full article body</p>")).toBe(
      true,
    )
  })

  it("刷新时已有正文的条目跳过，只抓新条目", async () => {
    serve({ "https://blog.example.com/": { body: listingPage } })
    // 传入固定 feedId 才有稳定条目 id，这正是刷新链路的情形
    const first = await previewFeed("https://blog.example.com/", "feed-fixed")
    const storedIds = first.entries.slice(0, 2).map((entry) => entry.id)
    expect(storedIds).toHaveLength(2)

    readabilityMock.mockClear()
    getEntryMany.mockResolvedValue(
      storedIds.map((id) => ({ id, content: "<p>already stored</p>" })),
    )

    await previewFeed("https://blog.example.com/", "feed-fixed")

    expect(readabilityMock).toHaveBeenCalledTimes(1)
  })

  it("首次订阅没有 feedId，条目 id 不稳定，因此全部抓取", async () => {
    serve({ "https://blog.example.com/": { body: listingPage } })

    await previewFeed("https://blog.example.com/")

    expect(readabilityMock).toHaveBeenCalledTimes(3)
  })

  it("单篇抓取失败时保留列表页摘要，不影响整个订阅", async () => {
    const listingWithExcerpt = `<!doctype html><html><head><title>Example Blog</title></head><body><main>
      <li class="p"><a href="/a/">First Real Article</a><time datetime="2026-01-03">x</time>
        <p>第一篇的摘要段落。</p></li>
      <li class="p"><a href="/b/">Second Real Article</a><time datetime="2026-01-02">x</time>
        <p>第二篇的摘要段落。</p></li>
      <li class="p"><a href="/c/">Third Real Article</a><time datetime="2026-01-01">x</time>
        <p>第三篇的摘要段落。</p></li>
    </main></body></html>`
    serve({ "https://blog.example.com/": { body: listingWithExcerpt } })
    readabilityMock.mockRejectedValue(new Error("net::ERR_CONNECTION_CLOSED"))

    const preview = await previewFeed("https://blog.example.com/")

    expect(preview.entries).toHaveLength(3)
    expect(preview.entries[0]!.content).toContain("第一篇的摘要段落")
  })

  it("订阅源文档不触发正文补全", async () => {
    serve({ "https://blog.example.com/atom.xml": { body: atomFeed } })

    await previewFeed("https://blog.example.com/atom.xml")

    expect(readabilityMock).not.toHaveBeenCalled()
    expect(getEntryMany).not.toHaveBeenCalled()
  })
})
