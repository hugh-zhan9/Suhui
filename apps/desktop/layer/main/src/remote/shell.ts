const remoteShellHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Suhui Remote</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family:
          "SF Pro Display",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          sans-serif;
      }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f4f1ea 0%, #fbfaf7 100%);
        color: #1f2328;
      }
      .page {
        max-width: 960px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
        margin-bottom: 24px;
      }
      .title {
        margin: 0;
        font-size: 32px;
        font-weight: 700;
      }
      .subtitle {
        margin: 8px 0 0;
        color: #5b6470;
        font-size: 14px;
      }
      .status {
        padding: 10px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.75);
        border: 1px solid rgba(31, 35, 40, 0.08);
        font-size: 13px;
      }
      .panel {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(31, 35, 40, 0.08);
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 12px 40px rgba(31, 35, 40, 0.08);
      }
      .panel-title {
        margin: 0 0 16px;
        font-size: 18px;
        font-weight: 600;
      }
      .columns {
        display: grid;
        grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
        gap: 16px;
      }
      .section-title {
        margin: 0 0 12px;
        font-size: 14px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #5b6470;
      }
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .section-title.section-title--compact {
        margin: 0;
      }
      .list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 12px;
      }
      .item {
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(244, 241, 234, 0.65);
        border: 1px solid rgba(31, 35, 40, 0.06);
        cursor: pointer;
      }
      .item.is-active {
        border-color: rgba(178, 100, 42, 0.45);
        background: rgba(220, 180, 140, 0.18);
      }
      .item-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .item-meta {
        margin-top: 6px;
        color: #5b6470;
        font-size: 13px;
      }
      .item-actions {
        margin-top: 12px;
        display: flex;
        justify-content: flex-end;
      }
      .item-button {
        border: 0;
        border-radius: 999px;
        padding: 8px 12px;
        background: #b2642a;
        color: #fff;
        font-size: 12px;
        cursor: pointer;
      }
      .item-button[disabled] {
        opacity: 0.55;
        cursor: default;
      }
      .empty {
        margin: 0;
        color: #5b6470;
        font-size: 14px;
      }
      .request-state {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 24px;
        margin-bottom: 12px;
      }
      .request-state[hidden] {
        display: none;
      }
      @media (prefers-color-scheme: dark) {
        body {
          background: linear-gradient(180deg, #11161b 0%, #171d24 100%);
          color: #f5f7fa;
        }
        .subtitle,
        .item-meta,
        .empty {
          color: #a8b3bf;
        }
        .status,
        .panel {
          background: rgba(17, 22, 27, 0.78);
          border-color: rgba(255, 255, 255, 0.08);
        }
        .item {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.06);
        }
        .item.is-active {
          border-color: rgba(247, 184, 119, 0.4);
          background: rgba(247, 184, 119, 0.08);
        }
      }
      @media (max-width: 800px) {
        .columns {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="hero">
        <div>
          <h1 class="title">Suhui Remote</h1>
          <p class="subtitle">Remote subscription access powered by the running desktop app.</p>
        </div>
        <div id="remote-status" class="status">Connecting...</div>
      </header>
      <main id="remote-root" class="panel">
        <div class="columns">
          <section>
            <div class="section-header">
              <h2 class="section-title section-title--compact">Subscriptions</h2>
              <div class="item-actions">
                <button id="refresh-all-button" class="item-button">Refresh All</button>
                <button id="refresh-feed-button" class="item-button" disabled>Refresh</button>
              </div>
            </div>
            <div id="bootstrap-state" class="request-state">
              <p id="bootstrap-state-message" class="empty">Loading subscriptions...</p>
              <button id="bootstrap-retry-button" class="item-button" hidden>Retry</button>
            </div>
            <div id="subscription-panel">
              <p class="empty">Loading...</p>
            </div>
          </section>
          <section>
            <h2 class="section-title">Entries</h2>
            <div id="entries-state" class="request-state" hidden>
              <p id="entries-state-message" class="empty"></p>
              <button id="entries-retry-button" class="item-button" hidden>Retry entries</button>
            </div>
            <div id="entry-panel">
              <p class="empty">Choose a subscription.</p>
            </div>
            <div class="item-actions">
              <button id="load-more-entries" class="item-button" hidden>Load more</button>
            </div>
          </section>
        </div>
      </main>
    </div>
    <script type="module" src="/remote.js"></script>
  </body>
</html>`

const remoteShellScript = `const root = document.getElementById("remote-root");
const subscriptionPanel = document.getElementById("subscription-panel");
const entryPanel = document.getElementById("entry-panel");
const status = document.getElementById("remote-status");
const refreshAllButton = document.getElementById("refresh-all-button");
const refreshButton = document.getElementById("refresh-feed-button");
const bootstrapState = document.getElementById("bootstrap-state");
const bootstrapStateMessage = document.getElementById("bootstrap-state-message");
const bootstrapRetryButton = document.getElementById("bootstrap-retry-button");
const entriesState = document.getElementById("entries-state");
const entriesStateMessage = document.getElementById("entries-state-message");
const entriesRetryButton = document.getElementById("entries-retry-button");
const loadMoreButton = document.getElementById("load-more-entries");
let activeFeedId = null;
let subscriptionsCache = [];
let unreadCache = {};
let entriesCache = [];
let nextEntryCursor = null;
let entriesHasMore = false;
let entriesPending = false;
let entriesRequestVersion = 0;
let bootstrapPending = false;
let bootstrapOwnerPending = false;
let trailingBootstrapRequested = false;
let trailingBootstrapReloadEntries = false;
let eventStreamDisconnected = false;
const processedBatchIds = new Map();
const processedBatchTtlMs = 5 * 60 * 1000;
const processedBatchLimit = 512;

const parseEntryChangeEventV1 = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.version !== 1) {
    return null;
  }
  const reasons = new Set(["refresh", "read", "collection", "subscription", "import"]);
  const scopes = new Set(["feeds", "all"]);
  const batchId = typeof input.batchId === "string" ? input.batchId.trim() : "";
  const source = typeof input.source === "string" ? input.source.trim() : "";
  if (
    !batchId ||
    !source ||
    !reasons.has(input.reason) ||
    !scopes.has(input.scope) ||
    !Array.isArray(input.feedIds) ||
    input.feedIds.some((feedId) => typeof feedId !== "string") ||
    !Number.isInteger(input.completedAt) ||
    input.completedAt < 0
  ) {
    return null;
  }
  const feedIds = Array.from(new Set(input.feedIds.map((feedId) => feedId.trim()).filter(Boolean)));
  if (input.scope === "feeds" && feedIds.length === 0 && input.reason !== "refresh") return null;
  if (input.refreshed !== undefined && (!Number.isInteger(input.refreshed) || input.refreshed < 0)) {
    return null;
  }
  if (input.failed !== undefined && (!Number.isInteger(input.failed) || input.failed < 0)) return null;
  if (
    input.scope === "feeds" &&
    input.reason === "refresh" &&
    input.refreshed !== undefined &&
    input.refreshed !== feedIds.length
  ) {
    return null;
  }
  if (
    input.entryIds !== undefined &&
    (!Array.isArray(input.entryIds) || input.entryIds.some((entryId) => typeof entryId !== "string"))
  ) {
    return null;
  }
  const entryIds = input.entryIds
    ? Array.from(new Set(input.entryIds.map((entryId) => entryId.trim()).filter(Boolean)))
    : undefined;
  const feedId = typeof input.feedId === "string" ? input.feedId.trim() : "";
  if (input.feedId !== undefined && !feedId) return null;
  if (feedId && (input.scope !== "feeds" || feedIds.length !== 1 || feedIds[0] !== feedId)) return null;
  return {
    ...input,
    batchId,
    source,
    feedIds,
    ...(entryIds ? { entryIds } : {}),
    ...(feedId ? { feedId } : {}),
  };
};

const pruneProcessedBatchIds = (now) => {
  for (const [batchId, processedAt] of processedBatchIds) {
    if (now - processedAt <= processedBatchTtlMs) continue;
    processedBatchIds.delete(batchId);
  }
  while (processedBatchIds.size > processedBatchLimit) {
    const oldestBatchId = processedBatchIds.keys().next().value;
    if (oldestBatchId === undefined) break;
    processedBatchIds.delete(oldestBatchId);
  }
};

const renderSubscriptions = (items) => {
  if (!items || items.length === 0) {
    subscriptionPanel.innerHTML = '<p class="empty">No subscriptions yet.</p>';
    return;
  }

  const list = items
    .map((item) => {
      const meta = [item.type, item.category, item.feedId].filter(Boolean).join(" · ");
      const activeClass = item.feedId === activeFeedId ? ' is-active' : '';
      const unread = unreadCache[item.feedId] || 0;
      const unreadLabel = unread > 0 ? ' · ' + unread + ' unread' : '';
      return '<li class="item' + activeClass + '" data-feed-id="' + (item.feedId || '') + '"><p class="item-title">' +
        (item.title || item.id) +
        '</p><p class="item-meta">' +
        (meta || item.id) +
        unreadLabel +
        '</p></li>';
    })
    .join("");

  subscriptionPanel.innerHTML = '<ul class="list">' + list + '</ul>';
  subscriptionPanel.querySelectorAll("[data-feed-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const nextFeedId = node.getAttribute("data-feed-id");
      if (!nextFeedId) return;
      activeFeedId = nextFeedId;
      renderSubscriptions(subscriptionsCache);
      syncRefreshButton();
      entriesCache = [];
      renderEntries(entriesCache);
      void loadEntries(nextFeedId, { append: false });
    });
  });
};

const renderEntries = (items) => {
  if (!items || items.length === 0) {
    entryPanel.innerHTML = '<p class="empty">No entries for this subscription yet.</p>';
    return;
  }

  const list = items
    .map((item) => {
      const publishedAt = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "Unknown time";
      const buttonLabel = item.read ? "Read" : "Mark read";
      return '<li class="item"><p class="item-title">' +
        (item.title || item.id) +
        '</p><p class="item-meta">' +
        publishedAt +
        '</p><div class="item-actions"><button class="item-button" data-entry-id="' + item.id + '"' +
        (item.read ? " disabled" : "") +
        '>' + buttonLabel + '</button></div><p class="item-meta">' +
        (item.read ? "Read" : "Unread") +
        '</p></li>';
    })
    .join("");

  entryPanel.innerHTML = '<ul class="list">' + list + '</ul>';
  entryPanel.querySelectorAll("[data-entry-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const entryId = node.getAttribute("data-entry-id");
      if (!entryId || node.hasAttribute("disabled")) return;
      node.setAttribute("disabled", "true");
      try {
        const response = await fetch("/api/entries/read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entryIds: [entryId],
            read: true,
          }),
        });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        const payload = await response.json();
        await handleEntryChange(payload.changeSet);
      } catch (error) {
        node.removeAttribute("disabled");
        console.error("[remote-shell] failed to update read status", error);
      }
    });
  });
  syncEntryActions();
};

const setStatus = (label) => {
  status.textContent = label;
};

const syncRefreshButton = () => {
  if (!refreshButton) return;
  if (activeFeedId) {
    refreshButton.removeAttribute("disabled");
  } else {
    refreshButton.setAttribute("disabled", "true");
  }
};

const setBootstrapState = (kind, message) => {
  if (!bootstrapState || !bootstrapStateMessage || !bootstrapRetryButton) return;
  bootstrapState.hidden = kind === "ready";
  bootstrapStateMessage.textContent = message;
  bootstrapRetryButton.hidden = kind !== "error";
  bootstrapRetryButton.toggleAttribute("disabled", bootstrapPending);
};

const setEntriesState = (kind, message) => {
  if (!entriesState || !entriesStateMessage || !entriesRetryButton) return;
  entriesState.hidden = kind === "ready";
  entriesStateMessage.textContent = message;
  entriesRetryButton.hidden = kind !== "error";
  entriesRetryButton.toggleAttribute("disabled", entriesPending);
};

const syncEntryActions = () => {
  if (!loadMoreButton) return;
  loadMoreButton.hidden = !entriesHasMore || !nextEntryCursor;
  loadMoreButton.toggleAttribute("disabled", entriesPending);
};

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isAbsent = (value) => value === undefined || value === null;

const normalizeOptionalString = (record, key) => {
  const value = record[key];
  if (isAbsent(value)) return null;
  if (typeof value !== "string") throw new Error("Invalid bootstrap subscription");
  return value;
};

const normalizeSubscription = (value) => {
  if (!isRecord(value) || !isNonEmptyString(value.id)) {
    throw new Error("Invalid bootstrap subscription");
  }
  const feedId = isAbsent(value.feedId) ? null : value.feedId;
  const listId = isAbsent(value.listId) ? null : value.listId;
  const inboxId = isAbsent(value.inboxId) ? null : value.inboxId;
  const sourceMatches =
    (value.type === "feed" && isNonEmptyString(feedId) && listId === null && inboxId === null) ||
    (value.type === "list" && feedId === null && isNonEmptyString(listId) && inboxId === null) ||
    (value.type === "inbox" && feedId === null && listId === null && isNonEmptyString(inboxId));
  if (!sourceMatches) throw new Error("Invalid bootstrap subscription");

  return {
    ...value,
    id: value.id.trim(),
    feedId: typeof feedId === "string" ? feedId.trim() : null,
    listId: typeof listId === "string" ? listId.trim() : null,
    inboxId: typeof inboxId === "string" ? inboxId.trim() : null,
    title: normalizeOptionalString(value, "title"),
    category: normalizeOptionalString(value, "category"),
  };
};

const normalizeUnread = (value) => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !Number.isInteger(value.count) ||
    value.count < 0
  ) {
    throw new Error("Invalid bootstrap unread count");
  }
  return { id: value.id.trim(), count: value.count };
};

const handleEntryChange = async (input) => {
  const change = parseEntryChangeEventV1(input);
  if (!change) return "ignored-invalid";
  const now = Date.now();
  pruneProcessedBatchIds(now);
  if (processedBatchIds.has(change.batchId)) return "duplicate";
  processedBatchIds.set(change.batchId, now);
  pruneProcessedBatchIds(now);

  switch (change.reason) {
    case "refresh":
      if (change.feedIds.length === 0) return "handled";
      await loadBootstrap({
        reloadEntries: Boolean(activeFeedId && change.feedIds.includes(activeFeedId)),
      });
      break;
    case "read":
      await loadBootstrap({
        reloadEntries: Boolean(
          activeFeedId &&
          change.entryIds &&
          entriesCache.some((entry) => change.entryIds.includes(entry.id)),
        ),
      });
      break;
    case "subscription":
    case "import":
      await loadBootstrap({ reloadEntries: true });
      break;
    case "collection":
      break;
  }
  return "handled";
};

const handleServerEvent = (event) => {
  try {
    void handleEntryChange(JSON.parse(event.data || "{}"));
  } catch (error) {
    console.error("[remote-shell] failed to parse server event", error);
  }
};

const connectEvents = () => {
  const eventSource = new EventSource("/events");
  eventSource.addEventListener("ready", () => {
    setStatus("Connected · Realtime online");
    if (!eventStreamDisconnected) return;
    eventStreamDisconnected = false;
    void loadBootstrap({ reloadEntries: true });
  });
  eventSource.addEventListener("ping", () => {
    setStatus("Connected · Realtime online");
  });
  eventSource.onerror = () => {
    eventStreamDisconnected = true;
    setStatus("Disconnected");
  };
  eventSource.addEventListener("subscriptions.updated", handleServerEvent);
  eventSource.addEventListener("entries.updated", handleServerEvent);
};

const refreshActiveFeed = async () => {
  if (!activeFeedId || !refreshButton) return;
  refreshButton.setAttribute("disabled", "true");
  setStatus("Refreshing...");
  try {
    const response = await fetch("/api/feeds/" + encodeURIComponent(activeFeedId) + "/refresh", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const payload = await response.json();
    setStatus("Connected · Refresh complete");
    await handleEntryChange(payload.changeSet);
  } catch (error) {
    setStatus("Connected · Refresh failed");
    console.error("[remote-shell] failed to refresh feed", error);
  } finally {
    syncRefreshButton();
  }
};

const refreshAllFeeds = async () => {
  if (!refreshAllButton) return;
  refreshAllButton.setAttribute("disabled", "true");
  if (refreshButton) {
    refreshButton.setAttribute("disabled", "true");
  }
  setStatus("Refreshing all feeds...");
  try {
    const response = await fetch("/api/feeds/refresh-all", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const payload = await response.json();
    setStatus("Connected · Refresh all complete");
    await handleEntryChange(payload.changeSet);
  } catch (error) {
    setStatus("Connected · Refresh all failed");
    console.error("[remote-shell] failed to refresh all feeds", error);
  } finally {
    refreshAllButton.removeAttribute("disabled");
    syncRefreshButton();
  }
};

const loadEntries = async (feedId, { append = false } = {}) => {
  if (!feedId || feedId !== activeFeedId) return;
  if (append && (entriesPending || !entriesHasMore || !nextEntryCursor)) return;

  const requestVersion = append ? entriesRequestVersion : ++entriesRequestVersion;
  const requestedCursor = append ? nextEntryCursor : null;
  entriesPending = true;
  if (!append) {
    nextEntryCursor = null;
    entriesHasMore = false;
    setEntriesState("loading", "Loading entries...");
  }
  syncEntryActions();
  try {
    const params = new URLSearchParams({ feedId });
    params.set("limit", "20");
    if (append && nextEntryCursor) params.set("cursor", nextEntryCursor);
    const response = await fetch("/api/entries?" + params.toString());
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const payload = await response.json();
    if (
      !payload ||
      !Array.isArray(payload.data) ||
      !payload.page ||
      typeof payload.page.hasMore !== "boolean" ||
      (payload.page.nextCursor !== null && typeof payload.page.nextCursor !== "string")
    ) {
      throw new Error("Invalid entries response");
    }
    if (requestVersion !== entriesRequestVersion || feedId !== activeFeedId) return;
    if (append && requestedCursor !== nextEntryCursor) return;
    if (append) {
      const existingIds = new Set(entriesCache.map((entry) => entry.id));
      entriesCache = entriesCache.concat(
        payload.data.filter((entry) => {
          if (existingIds.has(entry.id)) return false;
          existingIds.add(entry.id);
          return true;
        }),
      );
    } else {
      entriesCache = payload.data;
    }
    entriesHasMore = payload.page.hasMore;
    nextEntryCursor = payload.page.nextCursor;
    renderEntries(entriesCache);
    setEntriesState("ready", "");
  } catch (error) {
    if (requestVersion !== entriesRequestVersion || feedId !== activeFeedId) return;
    setEntriesState("error", append ? "Failed to load more entries." : "Failed to load entries.");
    console.error("[remote-shell] failed to load entries", error);
  } finally {
    if (requestVersion === entriesRequestVersion && feedId === activeFeedId) {
      entriesPending = false;
      setEntriesState(
        entriesState && entriesState.hidden ? "ready" : entriesRetryButton && !entriesRetryButton.hidden ? "error" : "loading",
        entriesStateMessage ? entriesStateMessage.textContent || "" : "",
      );
      syncEntryActions();
    }
  }
};

const loadBootstrapPass = async (reloadEntries) => {
  bootstrapPending = true;
  setStatus("Loading subscriptions...");
  setBootstrapState("loading", "Loading subscriptions...");
  try {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    const bootstrap = payload && payload.data;
    if (
      !bootstrap ||
      !Array.isArray(bootstrap.subscriptions) ||
      !Array.isArray(bootstrap.feeds) ||
      !Array.isArray(bootstrap.unread) ||
      !Array.isArray(bootstrap.collections) ||
      !isRecord(bootstrap.settings) ||
      !isRecord(bootstrap.capabilities)
    ) {
      throw new Error("Invalid bootstrap response");
    }

    const nextSubscriptions = bootstrap.subscriptions.map(normalizeSubscription);
    const nextUnread = bootstrap.unread.map(normalizeUnread);
    const nextUnreadCache = Object.fromEntries(nextUnread.map((item) => [item.id, item.count]));
    const previousFeedId = activeFeedId;
    const currentFeedStillExists = nextSubscriptions.some((item) => item.feedId === activeFeedId);
    const nextActiveFeedId = currentFeedStillExists
      ? activeFeedId
      : nextSubscriptions.find((item) => item.feedId)?.feedId || null;

    subscriptionsCache = nextSubscriptions;
    unreadCache = nextUnreadCache;
    activeFeedId = nextActiveFeedId;
    renderSubscriptions(subscriptionsCache);
    syncRefreshButton();
    setBootstrapState("ready", "");
    setStatus("Connected · Metadata ready");

    if (activeFeedId && (reloadEntries || activeFeedId !== previousFeedId)) {
      if (activeFeedId !== previousFeedId) {
        entriesCache = [];
        renderEntries(entriesCache);
      }
      return activeFeedId;
    } else {
      if (!activeFeedId) {
        entriesRequestVersion += 1;
        entriesCache = [];
        nextEntryCursor = null;
        entriesHasMore = false;
        entryPanel.innerHTML = '<p class="empty">Choose a subscription.</p>';
        syncEntryActions();
        setEntriesState("ready", "");
      }
    }
    return null;
  } catch (error) {
    setBootstrapState("error", "Failed to load subscriptions.");
    setStatus("Metadata unavailable");
    console.error("[remote-shell] failed to load bootstrap", error);
    return null;
  } finally {
    bootstrapPending = false;
    if (bootstrapRetryButton) bootstrapRetryButton.toggleAttribute("disabled", false);
  }
};

const loadBootstrap = async ({ reloadEntries = false } = {}) => {
  if (bootstrapOwnerPending) {
    trailingBootstrapRequested = true;
    trailingBootstrapReloadEntries = trailingBootstrapReloadEntries || reloadEntries;
    return;
  }

  bootstrapOwnerPending = true;
  let requestedReloadEntries = reloadEntries;
  try {
    while (true) {
      trailingBootstrapRequested = false;
      trailingBootstrapReloadEntries = false;
      const feedIdToReload = await loadBootstrapPass(requestedReloadEntries);
      if (feedIdToReload && !(trailingBootstrapRequested && trailingBootstrapReloadEntries)) {
        await loadEntries(feedIdToReload, { append: false });
      }
      if (!trailingBootstrapRequested) break;
      requestedReloadEntries = trailingBootstrapReloadEntries;
    }
  } finally {
    bootstrapOwnerPending = false;
  }
};

if (refreshButton) {
  refreshButton.addEventListener("click", () => {
    void refreshActiveFeed();
  });
}

if (refreshAllButton) {
  refreshAllButton.addEventListener("click", () => {
    void refreshAllFeeds();
  });
}

if (bootstrapRetryButton) {
  bootstrapRetryButton.addEventListener("click", () => {
    void loadBootstrap({ reloadEntries: entriesCache.length === 0 });
  });
}

if (entriesRetryButton) {
  entriesRetryButton.addEventListener("click", () => {
    if (!activeFeedId) return;
    void loadEntries(activeFeedId, { append: false });
  });
}

if (loadMoreButton) {
  loadMoreButton.addEventListener("click", () => {
    if (!activeFeedId) return;
    void loadEntries(activeFeedId, { append: true });
  });
}

connectEvents();
void loadBootstrap({ reloadEntries: true });
`

export const getRemoteShellHtml = () => remoteShellHtml
export const getRemoteShellScript = () => remoteShellScript
