const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

export const buildConsoleHomeHtml = ({ baseUrl, token: _token, mode }) => {
  const statusUrl = `${baseUrl}/status`
  const routesRssUrl = `${baseUrl}/rsshub/routes/en`
  const routesIndexUrl = `${baseUrl}/routes-index`

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeFolo RSSHub 控制台</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; color: #111; background: #fafafa; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 6px; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .card { border: 1px solid #e4e4e7; border-radius: 10px; padding: 16px; max-width: 1080px; background: #fff; margin-bottom: 16px; }
    .muted { color: #52525b; font-size: 14px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .toolbar input, .toolbar select { padding: 8px; border: 1px solid #d4d4d8; border-radius: 8px; font-size: 14px; }
    .routes { margin-top: 12px; display: grid; gap: 12px; }
    .route-item { border: 1px solid #e4e4e7; border-radius: 10px; padding: 12px; }
    .route-title { font-weight: 600; margin-bottom: 6px; }
    .route-meta { color: #52525b; font-size: 13px; margin-bottom: 8px; }
    .params { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin: 8px 0; }
    .params label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #52525b; }
    .params input { padding: 7px; border: 1px solid #d4d4d8; border-radius: 8px; }
    .links { margin-top: 8px; font-size: 13px; display: grid; gap: 6px; }
    .pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; border: 1px solid #d4d4d8; font-size: 12px; margin-right: 6px; }
    .empty { color: #71717a; font-size: 14px; padding: 16px 4px; }
    button { padding: 7px 10px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; cursor: pointer; }
    button:hover { background: #f4f4f5; }
  </style>
</head>
<body>
  <div class="card">
    <h2>FreeFolo RSSHub 本地控制台</h2>
    <p class="muted">当前模式：<code>${escapeHtml(mode)}</code></p>
    <ul>
      <li><a href="${escapeHtml(statusUrl)}" target="_blank" rel="noreferrer">查看服务状态 /status</a></li>
      <li><a href="${escapeHtml(routesRssUrl)}" target="_blank" rel="noreferrer">查看路由 RSS 清单 /rsshub/routes/en</a></li>
    </ul>
  </div>
  <div class="card">
    <div class="toolbar">
      <input id="keyword" placeholder="搜索路由/站点/描述，例如 github、bilibili" />
      <select id="category"><option value="">全部分类</option></select>
      <button id="refresh" type="button">刷新路由</button>
      <span id="summary" class="muted"></span>
    </div>
    <div id="routes" class="routes"></div>
  </div>
  <script>
    const baseUrl = ${JSON.stringify(baseUrl)};
    const routesIndexUrl = ${JSON.stringify(routesIndexUrl)};
    const state = { all: [], filtered: [] };

    const routeList = document.getElementById("routes");
    const keywordInput = document.getElementById("keyword");
    const categorySelect = document.getElementById("category");
    const summary = document.getElementById("summary");

    const fillRoutePath = (pathTemplate, values) => {
      return pathTemplate.replace(/:([A-Za-z0-9_]+)(?:\\{[^}]*\\})?[?*+]?/g, (_, key) => {
        const value = (values[key] || "").trim();
        return value.length > 0 ? encodeURIComponent(value) : "";
      }).replace(/\\/+/g, "/");
    };

    const buildQueryParams = (parameters, values) => {
      const query = new URLSearchParams();
      Object.keys(parameters || {}).forEach((key) => {
        const value = (values[key] || "").trim();
        if (value.length > 0) query.set(key, value);
      });
      return query.toString();
    };

    const buildLinks = (route, values) => {
      const routePath = fillRoutePath(route.path, values);
      const query = buildQueryParams(route.parameters, values);
      const finalPath = query ? routePath + "?" + query : routePath;
      const schemeUrl = "rsshub:/" + finalPath;
      const httpUrl = baseUrl + finalPath;
      return { schemeUrl, httpUrl };
    };

    const renderRouteItem = (route) => {
      const container = document.createElement("div");
      container.className = "route-item";
      const title = document.createElement("div");
      title.className = "route-title";
      title.textContent = route.name || route.path;
      container.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "route-meta";
      meta.textContent = route.path + (route.siteUrl ? " · " + route.siteUrl : "");
      container.appendChild(meta);

      if (Array.isArray(route.categories) && route.categories.length > 0) {
        const categories = document.createElement("div");
        route.categories.slice(0, 6).forEach((item) => {
          const pill = document.createElement("span");
          pill.className = "pill";
          pill.textContent = item;
          categories.appendChild(pill);
        });
        container.appendChild(categories);
      }

      const paramsWrapper = document.createElement("div");
      paramsWrapper.className = "params";
      const values = {};
      const parameterEntries = Object.entries(route.parameters || {});
      parameterEntries.forEach(([key, desc]) => {
        const label = document.createElement("label");
        label.textContent = key + (desc ? "（" + desc + "）" : "");
        const input = document.createElement("input");
        input.placeholder = key;
        input.addEventListener("input", () => {
          values[key] = input.value;
          renderLinks();
        });
        label.appendChild(input);
        paramsWrapper.appendChild(label);
      });

      if (parameterEntries.length > 0) {
        container.appendChild(paramsWrapper);
      }

      const links = document.createElement("div");
      links.className = "links";
      const scheme = document.createElement("code");
      const http = document.createElement("code");
      links.appendChild(scheme);
      links.appendChild(http);
      container.appendChild(links);

      const actionBar = document.createElement("div");
      actionBar.style.marginTop = "8px";
      const copyScheme = document.createElement("button");
      copyScheme.type = "button";
      copyScheme.textContent = "复制 rsshub:// 链接";
      copyScheme.onclick = async () => {
        const { schemeUrl } = buildLinks(route, values);
        await navigator.clipboard.writeText(schemeUrl);
      };
      const copyHttp = document.createElement("button");
      copyHttp.type = "button";
      copyHttp.style.marginLeft = "8px";
      copyHttp.textContent = "复制本地 HTTP 链接";
      copyHttp.onclick = async () => {
        const { httpUrl } = buildLinks(route, values);
        await navigator.clipboard.writeText(httpUrl);
      };
      actionBar.appendChild(copyScheme);
      actionBar.appendChild(copyHttp);
      container.appendChild(actionBar);

      const renderLinks = () => {
        const { schemeUrl, httpUrl } = buildLinks(route, values);
        scheme.textContent = schemeUrl;
        http.textContent = httpUrl;
      };

      renderLinks();
      return container;
    };

    const applyFilter = () => {
      const keyword = (keywordInput.value || "").toLowerCase().trim();
      const category = categorySelect.value || "";
      state.filtered = state.all.filter((item) => {
        if (category && !(item.categories || []).includes(category)) return false;
        if (!keyword) return true;
        const haystack = [
          item.path || "",
          item.name || "",
          item.siteUrl || "",
          item.description || "",
          item.example || "",
        ].join(" ").toLowerCase();
        return haystack.includes(keyword);
      });
      renderList();
    };

    const renderList = () => {
      routeList.innerHTML = "";
      summary.textContent = "共 " + state.all.length + " 条，当前 " + state.filtered.length + " 条";
      if (state.filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "没有匹配的路由";
        routeList.appendChild(empty);
        return;
      }
      state.filtered.forEach((route) => routeList.appendChild(renderRouteItem(route)));
    };

    const loadRoutes = async () => {
      const response = await fetch(routesIndexUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      const data = await response.json();
      state.all = Array.isArray(data.items) ? data.items : [];

      const categories = new Set();
      state.all.forEach((item) => (item.categories || []).forEach((category) => categories.add(category)));
      categorySelect.innerHTML = '<option value="">全部分类</option>';
      Array.from(categories).sort().forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      });
      applyFilter();
    };

    keywordInput.addEventListener("input", applyFilter);
    categorySelect.addEventListener("change", applyFilter);
    document.getElementById("refresh").addEventListener("click", () => { loadRoutes().catch(console.error); });

    loadRoutes().catch((error) => {
      routeList.innerHTML = '<div class="empty">路由加载失败：' + String(error.message || error) + "</div>";
    });
  </script>
</body>
</html>`
}
