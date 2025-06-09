import { FollowIcon } from "@follow/components/icons/follow.jsx"
import { Avatar, AvatarFallback, AvatarImage } from "@follow/components/ui/avatar/index.jsx"
import { Button } from "@follow/components/ui/button/index.js"
import { LoadingCircle, LoadingWithIcon } from "@follow/components/ui/loading/index.jsx"
import { cn } from "@follow/utils/utils"
import type { FC } from "react"
import { Fragment } from "react"
import { useTranslation } from "react-i18next"

import { useFollow } from "~/hooks/biz/useFollow"
import { useAuthQuery } from "~/hooks/common"
import { replaceImgUrlIfNeed } from "~/lib/img-proxy"
import { useUserSubscriptionsQuery } from "~/modules/profile/hooks"
import { users } from "~/queries/users"
import { useUserById } from "~/store/user"

import type { SubscriptionModalContentProps } from "./user-profile-modal.shared"
import { SubscriptionGroup } from "./user-profile-modal.shared"

// Social platform icons mapping
const socialIconClassNames = {
  twitter: "i-mgc-twitter-cute-fi",
  github: "i-mgc-github-cute-fi",
  instagram: "i-mingcute-ins-fill",
  facebook: "i-mingcute-facebook-fill",
  youtube: "i-mgc-youtube-cute-fi",
  discord: "i-mingcute-discord-fill",
}

const socialCopyMap = {
  twitter: "Twitter",
  github: "GitHub",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  discord: "Discord",
}

export const UserProfileModalContent: FC<SubscriptionModalContentProps> = ({ userId }) => {
  const { t } = useTranslation()
  const user = useAuthQuery(users.profile({ userId }))
  const storeUser = useUserById(userId)

  const userInfo = user.data
    ? {
        avatar: user.data.image,
        name: user.data.name,
        handle: user.data.handle,
        id: user.data.id,
      }
    : storeUser
      ? {
          avatar: storeUser.image,
          name: storeUser.name,
          handle: storeUser.handle,
          id: storeUser.id,
        }
      : null

  const follow = useFollow()
  const subscriptions = useUserSubscriptionsQuery(user.data?.id)

  return (
    <div>
      {userInfo && (
        <Fragment>
          <div className={"center m-12 mb-4 flex shrink-0 flex-col"}>
            <Avatar asChild className={"aspect-square size-16"}>
              <span>
                <AvatarImage
                  className="animate-in fade-in-0 duration-200"
                  draggable={false}
                  asChild
                  src={replaceImgUrlIfNeed(userInfo.avatar || undefined)}
                >
                  <img />
                </AvatarImage>
                <AvatarFallback>{userInfo.name?.slice(0, 2)}</AvatarFallback>
              </span>
            </Avatar>

            <div className={"relative flex cursor-text select-text flex-col items-center"}>
              <div className={"mb-1 flex items-center text-2xl font-bold"}>
                <h1 className="mt-4">{userInfo.name}</h1>
              </div>
              <div
                className={cn(
                  "text-sm text-zinc-500",
                  userInfo.handle ? "visible" : "hidden select-none",
                )}
              >
                @{userInfo.handle}
              </div>

              {/* Bio */}
              {user.data?.bio && (
                <div className="mt-3 max-w-xs text-center text-sm text-zinc-600">
                  {user.data.bio}
                </div>
              )}

              {/* Website */}
              {user.data?.website && (
                <div className="mt-2">
                  <a
                    href={user.data.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80 flex items-center gap-1 text-sm transition-colors"
                  >
                    <i className="i-mgc-link-cute-re text-base" />
                    {user.data.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}

              {/* Social Links */}
              {user.data?.socialLinks && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(user.data.socialLinks).map(([platform, url]) => {
                    if (!url || !(platform in socialIconClassNames)) return null

                    return (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent flex items-center justify-center rounded-full bg-zinc-100 p-2 text-zinc-500 transition-colors dark:bg-zinc-800"
                        title={socialCopyMap[platform as keyof typeof socialCopyMap]}
                      >
                        <i
                          className={cn(
                            socialIconClassNames[platform as keyof typeof socialIconClassNames],
                            "text-base",
                          )}
                        />
                      </a>
                    )
                  })}
                </div>
              )}

              <Button
                buttonClassName={"mt-4"}
                textClassName="gap-1"
                onClick={() => {
                  follow({
                    url: `rsshub://follow/profile/${userInfo.id}`,
                    isList: false,
                  })
                }}
              >
                <FollowIcon className="size-3" />
                <span>{t("feed_form.follow")}</span>
              </Button>
            </div>
          </div>
          <div className="w-full max-w-full grow">
            {subscriptions.isLoading ? (
              <LoadingWithIcon
                size="large"
                icon={
                  <Avatar className="aspect-square size-4">
                    <AvatarImage src={replaceImgUrlIfNeed(userInfo.avatar || undefined)} />
                    <AvatarFallback>{userInfo.name?.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                }
                className="center h-48 w-full max-w-full"
              />
            ) : (
              subscriptions.data && (
                <div className="flex w-full">
                  <div className="relative flex w-0 grow flex-col">
                    {Object.keys(subscriptions.data).map((category) => (
                      <SubscriptionGroup
                        key={category}
                        category={category}
                        subscriptions={subscriptions.data?.[category]!}
                        itemStyle="loose"
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </Fragment>
      )}

      {!userInfo && <LoadingCircle size="large" className="center h-full" />}
    </div>
  )
}
