import { Button } from "@follow/components/ui/button/index.js"
import { LoadingWithIcon } from "@follow/components/ui/loading/index.jsx"
import {
  useActionRules,
  useIsActionDataDirty,
  usePrefetchActions,
  useUpdateActionsMutation,
} from "@follow/store/action/hooks"
import { actionActions } from "@follow/store/action/store"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { unstable_usePrompt } from "react-router"
import { toast } from "sonner"

import { RuleCard } from "~/modules/action/rule-card"

export const ActionSetting = () => {
  const actions = useActionRules()

  const actionQuery = usePrefetchActions()

  if (actionQuery.isPending) {
    return <LoadingWithIcon icon={<i className="i-mgc-magic-2-cute-re" />} size="large" />
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 p-2">
      <ActionButtonGroup />
      <div className="@container flex flex-col gap-8">
        {actions.map((_, actionIdx) => {
          return <RuleCard key={actionIdx} index={actionIdx} />
        })}
      </div>
    </div>
  )
}

const ActionButtonGroup = () => {
  const queryClient = useQueryClient()
  const actionLength = useActionRules((actions) => actions.length)
  const isDirty = useIsActionDataDirty()
  const { t } = useTranslation("settings")
  unstable_usePrompt({
    message: t("actions.navigate.prompt"),
    when: ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  })

  const mutation = useUpdateActionsMutation({
    onSuccess: () => {
      // apply new action settings
      queryClient.invalidateQueries({
        queryKey: ["entries"],
      })
      toast(t("actions.saveSuccess"))
    },
    onError: (error) => {
      toast.error(error)
    },
  })

  return (
    <div className="flex w-full items-center justify-end gap-2">
      <Button
        variant={actionLength === 0 ? "primary" : "outline"}
        onClick={() => actionActions.addRule((number) => t("actions.actionName", { number }))}
      >
        <i className="i-mingcute-add-line mr-2" />
        {t("actions.newRule")}
      </Button>

      <Button onClick={() => mutation.mutate()}>
        <i className="i-mgc-check-circle-cute-re mr-2" />
        {t("actions.save")}
      </Button>
    </div>
  )
}
