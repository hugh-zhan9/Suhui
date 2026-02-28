import { describe, expect, it } from "vitest"

import {
  getRsshubFriendlyMessage,
  getRsshubLocalErrorTitle,
  parseRsshubLocalError,
  shouldShowRsshubRestartAction,
} from "./rsshub-local-error"

describe("rsshub local error parser", () => {
  it("应识别不可用错误", () => {
    const type = parseRsshubLocalError("RSSHUB_LOCAL_UNAVAILABLE: 内置 RSSHub 当前未运行")
    expect(type).toBe("unavailable")
    expect(getRsshubLocalErrorTitle(type)).toBe("内置 RSSHub 当前未运行")
    expect(shouldShowRsshubRestartAction(type)).toBe(true)
  })

  it("应识别冷却与健康检查错误", () => {
    expect(parseRsshubLocalError("RSSHub in cooldown")).toBe("cooldown")
    expect(parseRsshubLocalError("RSSHub health check failed")).toBe("healthcheck")
    expect(parseRsshubLocalError("内置 RSSHub 处于冷却中")).toBe("cooldown")
    expect(parseRsshubLocalError("内置 RSSHub 启动检查失败")).toBe("healthcheck")
    expect(parseRsshubLocalError("RSSHUB_ROUTE_NOT_IMPLEMENTED: /github/trending")).toBe(
      "route_not_implemented",
    )
    expect(parseRsshubLocalError("RSSHUB_ROUTE_NOT_WHITELISTED: /github/topic/foo")).toBe(
      "route_not_implemented",
    )
  })

  it("非 RSSHub 错误不触发重启按钮", () => {
    const type = parseRsshubLocalError("HTTP 404")
    expect(type).toBe("none")
    expect(getRsshubLocalErrorTitle(type)).toBe("")
    expect(shouldShowRsshubRestartAction(type)).toBe(false)
  })

  it("应输出友好错误文案", () => {
    expect(getRsshubFriendlyMessage("RSSHub in cooldown")).toBe("内置 RSSHub 处于冷却中")
    expect(getRsshubFriendlyMessage("RSSHUB_ROUTE_NOT_IMPLEMENTED: /github/trending")).toBe(
      "内置 RSSHub 暂未内置该路由，请先使用普通 RSS 订阅或等待后续版本",
    )
    expect(getRsshubFriendlyMessage("HTTP 404")).toBe("HTTP 404")
    expect(getRsshubFriendlyMessage("twitter api is not configured")).toBe(
      "Twitter 路由需要凭据。请在 RSSHub 控制台配置 TWITTER_COOKIE 后重启内置 RSSHub。",
    )
    expect(
      getRsshubFriendlyMessage(
        "RSSHUB_OFFICIAL_RUNTIME_ERROR: Could not find Chrome (ver. 136.0.7103.49)",
      ),
    ).toBe(
      "该 RSSHub 路由依赖浏览器运行环境（Chrome/Puppeteer），当前内置环境未安装。请改用无需浏览器的路由，或切换自定义 RSSHub 实例。",
    )
    expect(
      getRsshubFriendlyMessage(
        `RSSHUB_OFFICIAL_RUNTIME_ERROR:[GET] "https://qipamaijia.com/": <no response> fetch failed`,
      ),
    ).toBe(
      "该 RSSHub 源站当前不可达或拒绝访问（fetch failed）。源站：https://qipamaijia.com/。请稍后重试，或更换可用路由/自定义 RSSHub 实例。",
    )
  })
})
