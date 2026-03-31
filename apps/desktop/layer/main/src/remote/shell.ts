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
            <h2 class="section-title">Subscriptions</h2>
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
let activeFeedId = null;
let subscriptionsCache = [];

const renderSubscriptions = (items) => {
  if (!items || items.length === 0) {
    subscriptionPanel.innerHTML = '<p class="empty">No subscriptions yet.</p>';
    return;
  }

  const list = items
    .map((item) => {
      const meta = [item.type, item.category, item.feedId].filter(Boolean).join(" · ");
      const activeClass = item.feedId === activeFeedId ? ' is-active' : '';
      return '<li class="item' + activeClass + '" data-feed-id="' + (item.feedId || '') + '"><p class="item-title">' +
        (item.title || item.id) +
        '</p><p class="item-meta">' +
        (meta || item.id) +
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
      return '<li class="item"><p class="item-title">' +
        (item.title || item.id) +
        '</p><p class="item-meta">' +
        publishedAt +
        '</p></li>';
    })
    .join("");

  entryPanel.innerHTML = '<ul class="list">' + list + '</ul>';
};

const setStatus = (label) => {
  status.textContent = label;
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
    const response = await fetch("/api/subscriptions");
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const payload = await response.json();
    subscriptionsCache = payload.data || [];
    activeFeedId = subscriptionsCache.find((item) => item.feedId)?.feedId || null;
    renderSubscriptions(subscriptionsCache);
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

connectEvents();
void loadSubscriptions();
`

export const getRemoteShellHtml = () => remoteShellHtml
export const getRemoteShellScript = () => remoteShellScript
