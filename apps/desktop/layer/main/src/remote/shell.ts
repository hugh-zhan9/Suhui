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
              <button id="refresh-feed-button" class="item-button" disabled>Refresh</button>
            </div>
            <div id="subscription-panel">
              <p class="empty">Loading...</p>
            </div>
          </section>
          <section>
            <h2 class="section-title">Entries</h2>
            <div id="entry-panel">
              <p class="empty">Choose a subscription.</p>
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
const refreshButton = document.getElementById("refresh-feed-button");
let activeFeedId = null;
let subscriptionsCache = [];
let unreadCache = {};

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
      void loadEntries(nextFeedId);
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
        await fetch("/api/entries/read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entryIds: [entryId],
            read: true,
          }),
        });
        await loadSubscriptions();
        if (activeFeedId) {
          await loadEntries(activeFeedId);
        }
      } catch (error) {
        node.removeAttribute("disabled");
        console.error("[remote-shell] failed to update read status", error);
      }
    });
  });
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

const connectEvents = () => {
  const eventSource = new EventSource("/events");
  eventSource.addEventListener("ready", () => {
    setStatus("Connected · Realtime online");
  });
  eventSource.addEventListener("ping", () => {
    setStatus("Connected · Realtime online");
  });
  eventSource.onerror = () => {
    setStatus("Disconnected");
  };
  eventSource.addEventListener("subscriptions.updated", () => {
    void loadSubscriptions();
  });
  eventSource.addEventListener("entries.updated", (event) => {
    if (!activeFeedId) return;
    const payload = JSON.parse(event.data || "{}");
    if (payload.feedId && payload.feedId !== activeFeedId) return;
    void loadEntries(activeFeedId);
  });
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
    setStatus("Connected · Refresh complete");
    await loadSubscriptions();
    await loadEntries(activeFeedId);
  } catch (error) {
    setStatus("Connected · Refresh failed");
    console.error("[remote-shell] failed to refresh feed", error);
  } finally {
    syncRefreshButton();
  }
};

const loadEntries = async (feedId) => {
  entryPanel.innerHTML = '<p class="empty">Loading entries...</p>';
  try {
    const response = await fetch("/api/entries?feedId=" + encodeURIComponent(feedId));
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const payload = await response.json();
    renderEntries(payload.data || []);
  } catch (error) {
    entryPanel.innerHTML = '<p class="empty">Failed to load entries.</p>';
    console.error("[remote-shell] failed to load entries", error);
  }
};

const loadSubscriptions = async () => {
  setStatus("Loading subscriptions...");
  try {
    const [subscriptionsResponse, unreadResponse] = await Promise.all([
      fetch("/api/subscriptions"),
      fetch("/api/unread"),
    ]);
    if (!subscriptionsResponse.ok) {
      throw new Error("HTTP " + subscriptionsResponse.status);
    }
    if (!unreadResponse.ok) {
      throw new Error("HTTP " + unreadResponse.status);
    }
    const payload = await subscriptionsResponse.json();
    const unreadPayload = await unreadResponse.json();
    subscriptionsCache = payload.data || [];
    unreadCache = Object.fromEntries((unreadPayload.data || []).map((item) => [item.id, item.count]));
    activeFeedId = subscriptionsCache.find((item) => item.feedId)?.feedId || null;
    renderSubscriptions(subscriptionsCache);
    syncRefreshButton();
    if (activeFeedId) {
      await loadEntries(activeFeedId);
    } else {
      entryPanel.innerHTML = '<p class="empty">Choose a subscription.</p>';
    }
    setStatus("Connected · Initial sync complete");
  } catch (error) {
    subscriptionPanel.innerHTML = '<p class="empty">Failed to load subscriptions.</p>';
    entryPanel.innerHTML = '<p class="empty">Entries unavailable.</p>';
    setStatus("Disconnected");
    console.error("[remote-shell] failed to load subscriptions", error);
  }
};

if (refreshButton) {
  refreshButton.addEventListener("click", () => {
    void refreshActiveFeed();
  });
}

connectEvents();
void loadSubscriptions();
`

export const getRemoteShellHtml = () => remoteShellHtml
export const getRemoteShellScript = () => remoteShellScript
