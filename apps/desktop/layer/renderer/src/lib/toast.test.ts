import { describe, expect, it, vi } from "vitest"

const sonnerToast = Object.assign(vi.fn(), {
  error: vi.fn(),
  success: vi.fn(),
  dismiss: vi.fn(),
})

vi.mock("sonner", () => ({ toast: sonnerToast }))

const { deriveCopyText, toast } = await import("./toast")

describe("错误 toast 可复制", () => {
  it("纯字符串报错可复制", () => {
    expect(deriveCopyText("转换失败：连接被拒绝")).toBe("转换失败：连接被拒绝")
  })

  it("标题与 description 一起复制", () => {
    expect(deriveCopyText("转换失败", { description: "EHOSTUNREACH 192.168.1.9:5432" })).toBe(
      "转换失败\nEHOSTUNREACH 192.168.1.9:5432",
    )
  })

  it("message 是 ReactNode 时拿不到文本就不硬造", () => {
    expect(deriveCopyText({ type: "div" } as never)).toBe("")
  })

  it("error toast 会挂上复制动作并延长停留", () => {
    sonnerToast.error.mockClear()
    toast.error("数据库切换未生效")

    const [message, options] = sonnerToast.error.mock.calls[0]!
    expect(message).toBe("数据库切换未生效")
    expect(options.duration).toBe(10_000)
    expect(options.action.label).toBe("复制")
  })

  it("调用方自带 action 时不被抢占", () => {
    sonnerToast.error.mockClear()
    const own = { label: "重试", onClick: () => {} }
    toast.error("失败", { action: own })

    expect(sonnerToast.error.mock.calls[0]![1].action).toBe(own)
  })

  it("拿不到可复制文本时不加动作", () => {
    sonnerToast.error.mockClear()
    toast.error({ type: "div" } as never)

    expect(sonnerToast.error.mock.calls[0]![1].action).toBeUndefined()
  })

  it("success 等其它方法原样透传", () => {
    toast.success("好了")
    expect(sonnerToast.success).toHaveBeenCalledWith("好了")
  })
})
