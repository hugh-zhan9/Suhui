import { zodResolver } from "@hookform/resolvers/zod"
import { Logo } from "@suhui/components/icons/logo.jsx"
import { Button } from "@suhui/components/ui/button/index.js"
import { Card, CardHeader } from "@suhui/components/ui/card/index.jsx"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@suhui/components/ui/form/index.jsx"
import { Input } from "@suhui/components/ui/input/index.js"
import { useInboxById } from "@suhui/store/inbox/hooks"
import { inboxSyncService } from "@suhui/store/inbox/store"
import type { InboxModel } from "@suhui/store/inbox/types"
import { cn } from "@suhui/utils/utils"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { useCurrentModal } from "~/components/ui/modal/stacked/hooks"
import { createErrorToaster } from "~/lib/error-parser"
import { toast } from "~/lib/toast"
import { FollowSummary } from "~/modules/feed/feed-summary"

export const InboxForm: Component<{
  id?: string
  asWidget?: boolean
}> = ({ id, asWidget }) => {
  const inbox = useInboxById(id)

  const isSubscribed = true

  const { t } = useTranslation()

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        asWidget ? "mx-auto min-h-[210px] w-full max-w-[550px]" : "px-[18px] pb-[18px] pt-12",
      )}
    >
      {!asWidget && (
        <div className="mb-4 mt-2 flex items-center gap-2 text-[22px] font-bold">
          <Logo className="size-8" />
          {isSubscribed ? t("feed_form.update_follow") : t("feed_form.add_follow")}
        </div>
      )}
      <InboxInnerForm
        {...{
          inbox,
        }}
      />
    </div>
  )
}

const inboxHandleSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_-]+$/)

const formSchema = z.object({
  handle: inboxHandleSchema,
  title: z.string(),
})

const InboxInnerForm = ({ inbox }: { inbox?: Nullable<InboxModel> }) => {
  const currentModal = useCurrentModal()

  const { t } = useTranslation()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      handle: inbox?.id,
      title: inbox?.title || "",
    },
  })

  const mutationChange = useMutation({
    mutationFn: async ({ handle, title }: { handle: string; title: string }) => {
      await inboxSyncService.updateInbox({
        handle,
        title,
      })
    },
    onSuccess: () => {
      toast.success(t("discover.inbox_update_success"))
    },
    onError: createErrorToaster(t("discover.inbox_update_error")),
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    // 收件箱由云端服务分配地址，本地只能改名，因此这里没有新建分支。
    if (!inbox) return
    mutationChange.mutate({ handle: values.handle, title: values.title })
    currentModal.dismiss?.()
  }

  return (
    <div className="flex flex-1 flex-col gap-y-4">
      {inbox && (
        <Card>
          <CardHeader>
            <FollowSummary feed={inbox} />
          </CardHeader>
        </Card>
      )}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn("space-y-4")}
          data-testid="discover-form"
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("discover.inbox_title")}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className={cn("center flex justify-end gap-4")} data-testid="discover-form-actions">
            <Button type="submit" isLoading={mutationChange.isPending}>
              {t("discover.inbox_update")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
