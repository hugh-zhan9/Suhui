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
        <h2 class="panel-title">Subscriptions</h2>
        <p class="empty">Loading...</p>
      </main>
    </div>
    <script type="module" src="/remote.js"></script>
  </body>
</html>`

const remoteShellScript = `const root = document.getElementById("remote-root");
const status = document.getElementById("remote-status");

const renderSubscriptions = (items) => {
  const title = '<h2 class="panel-title">Subscriptions</h2>';
  if (!items || items.length === 0) {
    root.innerHTML = title + '<p class="empty">No subscriptions yet.</p>';
    return;
  }

  const list = items
    .map((item) => {
      const meta = [item.type, item.category, item.feedId].filter(Boolean).join(" · ");
      return '<li class="item"><p class="item-title">' +
        (item.title || item.id) +
        '</p><p class="item-meta">' +
        (meta || item.id) +
        '</p></li>';
    })
    .join("");

  root.innerHTML = title + '<ul class="list">' + list + '</ul>';
};

const setStatus = (label) => {
  status.textContent = label;
};

const load = async () => {
  setStatus("Loading subscriptions...");
  try {
    const response = await fetch("/api/subscriptions");
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const payload = await response.json();
    renderSubscriptions(payload.data || []);
    setStatus("Connected");
  } catch (error) {
    root.innerHTML = '<h2 class="panel-title">Subscriptions</h2><p class="empty">Failed to load subscriptions.</p>';
    setStatus("Disconnected");
    console.error("[remote-shell] failed to load subscriptions", error);
  }
};

void load();
`

export const getRemoteShellHtml = () => remoteShellHtml
export const getRemoteShellScript = () => remoteShellScript
