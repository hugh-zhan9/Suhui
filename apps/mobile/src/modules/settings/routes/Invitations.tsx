import { cn } from "@follow/utils"
import { useMutation, useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { setStringAsync } from "expo-clipboard"
import { Pressable, Text, View } from "react-native"

import { useServerConfigs } from "@/src/atoms/server-configs"
import { UINavigationHeaderActionButton } from "@/src/components/layouts/header/NavigationHeader"
import {
  NavigationBlurEffectHeader,
  SafeNavigationScrollView,
} from "@/src/components/layouts/views/SafeNavigationScrollView"
import { UserAvatar } from "@/src/components/ui/avatar/UserAvatar"
import { ContextMenu } from "@/src/components/ui/context-menu"
import {
  GroupedInformationCell,
  GroupedInsetActivityIndicatorCell,
  GroupedInsetListBaseCell,
  GroupedInsetListCard,
  GroupedInsetListSectionHeader,
} from "@/src/components/ui/grouped/GroupedList"
import { MonoText } from "@/src/components/ui/typography/MonoText"
import { LoveCuteFiIcon } from "@/src/icons/love_cute_fi"
import { PowerIcon } from "@/src/icons/power"
import { apiClient } from "@/src/lib/api-fetch"
import type { DialogComponent } from "@/src/lib/dialog"
import { Dialog } from "@/src/lib/dialog"
import { toastFetchError } from "@/src/lib/error-parser"
import type { NavigationControllerView } from "@/src/lib/navigation/types"
import { queryClient } from "@/src/lib/query-client"
import { toast } from "@/src/lib/toast"
import { accentColor } from "@/src/theme/colors"

const invitationQueryKey = ["invitations"]
const useInvitationsQuery = () => {
  return useQuery({
    queryKey: invitationQueryKey,
    queryFn: () => apiClient.invitations.$get(),
  })
}
const useInvitationsLimitationQuery = () => {
  const { data } = useQuery({
    queryKey: ["invitations", "limitation"],
    queryFn: () => apiClient.invitations.limitation.$get(),
  })
  return data?.data
}

const numberFormatter = new Intl.NumberFormat("en-US")
export const InvitationsScreen: NavigationControllerView = () => {
  const serverConfigs = useServerConfigs()

  const { data: invitations, isLoading } = useInvitationsQuery()
  const limitation = useInvitationsLimitationQuery()
  const handleCopyCode = (code: string) => {
    setStringAsync(code)
    toast.success("Copied to clipboard")
  }
  return (
    <SafeNavigationScrollView className="bg-system-grouped-background">
      <NavigationBlurEffectHeader title="Invitations" headerRight={<GenerateButton />} />
      <View className="mt-6">
        <GroupedInsetListCard>
          <GroupedInformationCell
            title="Invitations"
            icon={<LoveCuteFiIcon height={40} width={40} color="#fff" />}
            iconBackgroundColor={accentColor}
          >
            <Text className="text-label mt-3 text-base leading-tight">
              Follow is currently in <Text className="font-bold">early access</Text> and requires an
              invitation code to use. You can spend {serverConfigs?.INVITATION_PRICE}{" "}
              <View style={{ transform: [{ translateY: 6 }, { translateX: -2 }] }}>
                <PowerIcon color={accentColor} height={16} width={16} />
              </View>
              Power to generate an invitation code for your friends.
            </Text>

            <Text className="text-label mt-3 text-base leading-tight">
              Based on your usage time, you can generate up to{" "}
              {numberFormatter.format(limitation ?? 0)} invitation codes.
            </Text>
          </GroupedInformationCell>
        </GroupedInsetListCard>
      </View>

      <GroupedInsetListSectionHeader label="Invitations" />
      <GroupedInsetListCard>
        {isLoading && <GroupedInsetActivityIndicatorCell />}
        {invitations?.data?.map((invitation) => (
          <ContextMenu.Root key={invitation.code}>
            <ContextMenu.Trigger>
              <GroupedInsetListBaseCell className="bg-secondary-system-grouped-background flex-1">
                <View className="mr-2 shrink flex-row items-center gap-4">
                  <UserAvatar size={26} image={invitation.users?.image} preview={false} />
                  <View className="min-w-0 shrink">
                    <Text
                      className={cn("text-label", !invitation.users && "text-secondary-label")}
                      numberOfLines={1}
                    >
                      {invitation.users?.name || (!invitation.users ? "Not used" : "")}
                    </Text>
                    <Text className="text-secondary-label text-sm">
                      Created at {dayjs(invitation.createdAt).format("YYYY/MM/DD")}
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => handleCopyCode(invitation.code)}>
                  <MonoText className="text-label">{invitation.code}</MonoText>
                </Pressable>
              </GroupedInsetListBaseCell>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
              <ContextMenu.Item
                key="copy code"
                onSelect={() => {
                  handleCopyCode(invitation.code)
                }}
              >
                <ContextMenu.ItemTitle>Copy</ContextMenu.ItemTitle>
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Root>
        ))}
      </GroupedInsetListCard>
    </SafeNavigationScrollView>
  )
}

const GenerateButton = () => {
  const limitation = useInvitationsLimitationQuery()
  const { data: invitations } = useInvitationsQuery()
  const disabled = !limitation || (invitations && invitations?.data?.length >= limitation)
  return (
    <UINavigationHeaderActionButton
      disabled={disabled}
      onPress={() => {
        Dialog.show(ConfirmGenerateDialog)
      }}
    >
      <Text
        className={cn(
          "text-base font-semibold",
          !disabled ? "text-accent" : "text-secondary-label",
        )}
      >
        Generate
      </Text>
    </UINavigationHeaderActionButton>
  )
}

const ConfirmGenerateDialog: DialogComponent = () => {
  const serverConfigs = useServerConfigs()
  const { dismiss } = Dialog.useDialogContext()!

  const newInvitation = useMutation({
    mutationKey: ["newInvitation"],
    mutationFn: (values: Parameters<typeof apiClient.invitations.new.$post>[0]["json"]) =>
      apiClient.invitations.new.$post({ json: values }),
    onError(err) {
      toastFetchError(err)
    },
    onSuccess(data) {
      dismiss()

      toast.success("Generate successfully, code is copied to clipboard")

      type Invitation = {
        code: string
        createdAt: string | null
      }
      const old = queryClient.getQueryData<Invitation[]>(invitationQueryKey)

      queryClient.setQueryData<Invitation[]>(invitationQueryKey, () => {
        return [
          {
            code: data.data,
            createdAt: dayjs().toISOString(),
          },
          ...(old ?? []),
        ]
      })
      setStringAsync(data.data)
    },
  })

  return (
    <View>
      <Text>
        You can spend {serverConfigs?.INVITATION_PRICE}{" "}
        <View style={{ transform: [{ translateY: 2 }] }}>
          <PowerIcon color={accentColor} height={16} width={16} />
        </View>{" "}
        Power to generate an invitation code for your friends.
      </Text>

      <Dialog.DialogConfirm
        onPress={() => {
          newInvitation.mutateAsync({})
        }}
      />
    </View>
  )
}

ConfirmGenerateDialog.id = "ConfirmGenerateDialog"
ConfirmGenerateDialog.confirmText = "Generate"
ConfirmGenerateDialog.title = "Generate Invitation Code"
ConfirmGenerateDialog.headerIcon = <PowerIcon color={accentColor} height={24} width={24} />
