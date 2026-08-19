import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@suhui/components/ui/button/index.js", () => ({
  ActionButton: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
}))
vi.mock("@suhui/components/ui/platform-icon/icons.js", () => ({
  RSSHubLogo: () => <span>RSSHub</span>,
}))
vi.mock("@suhui/components/ui/portal/index.js", () => ({
  RootPortal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))
vi.mock("@suhui/components/ui/typography/EllipsisWithTooltip.js", () => ({
  EllipsisHorizontalTextWithTooltip: ({ children }: React.PropsWithChildren) => (
    <span>{children}</span>
  ),
}))
vi.mock("@suhui/hooks", () => ({
  useMeasure: () => [vi.fn(), { x: 0, y: 0 }, vi.fn()],
}))
vi.mock("@suhui/store/user/hooks", () => ({
  useWhoami: () => ({ id: "local_user_id", name: "Alice Local" }),
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}))
vi.mock("~/atoms/server-configs", () => ({
  useIsInMASReview: () => true,
}))
vi.mock("~/components/ui/dropdown-menu/dropdown-menu", () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuLabel: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))
vi.mock("~/modules/settings/modal/use-setting-modal-hack", () => ({
  useSettingModal: () => vi.fn(),
}))
vi.mock("~/queries/auth", () => ({
  useSession: () => ({
    status: "authenticated",
    session: { user: { id: "local_user_id", name: "Local User" } },
  }),
}))
vi.mock("./LoginButton", () => ({ LoginButton: () => <span>Login</span> }))
vi.mock("./UserAvatar", () => ({ UserAvatar: () => <button>Avatar</button> }))

import { ProfileButton } from "./ProfileButton"

describe("ProfileButton", () => {
  it("renders the current local profile instead of a stale session snapshot", () => {
    const html = renderToStaticMarkup(<ProfileButton />)

    expect(html).toContain("Alice Local")
    expect(html).not.toContain("Local User")
  })
})
