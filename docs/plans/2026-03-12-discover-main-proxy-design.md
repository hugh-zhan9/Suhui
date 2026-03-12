# Discover 主进程代理设计

- 目标：将 Trending/Discover 相关请求从 renderer 直连旧 API 改为主进程代理，避免 packaged 模式下 `app://suhui.io` 的 CORS 与 webSecurity 差异。
- 范围：`trending/feeds`、`discover/rsshub`、`discover/rsshub-analytics`、`discover/rsshub/route`。
- 方案：renderer 通过 `ipcServices` 调用 main 进程；main 进程用 Node `fetch` 请求 `https://api.folo.is`，返回 JSON 给 renderer。
- 风险：主进程会承担外部 API 错误处理，需要保留 URL/状态码日志，避免静默失败。
