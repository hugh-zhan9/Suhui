# 远程访问的 HTTPS 与添加到主屏幕

远程阅读端（`remote.html`）已经是可安装的 PWA。本文说明哪些能力在纯 HTTP 下就能用、
哪一项必须 HTTPS，以及套 TLS 反向代理时必须知道的一条安全边界。

## 纯 HTTP 下已经可用

Desktop app 运行时，手机在同一 LAN / VPN 内访问 `http://<Mac 地址>:41595`，
Safari 分享菜单里选「添加到主屏幕」即可：

- 全屏 standalone 显示，没有地址栏（靠 `apple-mobile-web-app-capable`，不要求 HTTPS）
- 应用图标与名称来自 `remote-manifest.webmanifest`
- 底部 Tab 的 app 形态布局

这部分不依赖 Service Worker。

## 必须 HTTPS 的那一项

`remote-sw.js` 只在**安全上下文**（HTTPS，或 localhost）下才会被浏览器注册。
通过 LAN IP 走 HTTP 时它始终不生效，这是浏览器的硬规则，应用侧无法绕开。

Service Worker 当前只缓存应用外壳，作用是桌面端短暂不可达时页面仍能打开。
**它不是离线阅读**：`/api/` 与 `/events` 一律直连网络，所以手机不会显示桌面端已经
改过的陈旧条目。要真正离线阅读需要另外缓存正文，目前没有做。

## 用反向代理拿到 HTTPS

远程客户端全部使用相对路径，不含硬编码的 scheme 或端口，因此套一层 TLS 终结
不需要改任何代码。

Tailscale（tailnet 需开启 MagicDNS 与 HTTPS 证书）：

```bash
tailscale serve --bg 41595
```

各版本子命令语法有过变化，以 `tailscale serve --help` 为准。之后在手机上访问
`https://<机器名>.<tailnet>.ts.net`，证书自动可信，Service Worker 即可注册。

自建反代（Caddy 等）同理，把 TLS 终结在前面、回源到 `http://127.0.0.1:41595` 即可。

## 私密内容的暴露面

笔记、高亮、规则、稍后读、文章标签这些路由**曾经**只允许本机桌面端访问，因为远程端
没有鉴权。现在它们对所有能连上 remote server 的对端开放——这是明确的选择，代价是
同网段（或能访问反向代理）的任何人无需凭据即可读写这些内容。

要恢复原来的边界，在 `manager.ts` 的请求入口用 `isLocalPeerRequest(request)` 重新
拦住 `isPrivateLocalReadingRoute(pathname)`，并把 bootstrap 的 `privateLocalReading`
改回按同一判定返回。`manager.test.ts` 里「serves private reading routes to a non-local
caller」这条会第一个失败，正好作为提示。

`isLocalPeerRequest` 仍然保留并在性能测试入口使用：它要求对端是环回**且**请求不带
`X-Forwarded-For` / `Forwarded` / `X-Real-Ip` 等转发头。同机反向代理是走 loopback
回源的，仅凭对端地址会把每个被转发的请求都当成本机桌面端。
