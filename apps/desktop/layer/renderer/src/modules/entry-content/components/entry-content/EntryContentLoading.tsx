import { Avatar, AvatarImage } from "@suhui/components/ui/avatar/index.jsx"
import { LoadingCircle, LoadingWithIcon } from "@suhui/components/ui/loading/index.jsx"
import { getUrlIcon } from "@suhui/utils/utils"

export const EntryContentLoading = (props: { icon?: string | null }) => {
  if (!props.icon) {
    return <LoadingWithIcon size="large" icon={<i className="i-mgc-docment-cute-re" />} />
  }
  return (
    <div className="center mb-14 flex flex-col gap-4">
      <Avatar className="animate-pulse rounded-sm">
        <AvatarImage src={getUrlIcon(props.icon).src} />
      </Avatar>
      <LoadingCircle size="medium" />
    </div>
  )
}
