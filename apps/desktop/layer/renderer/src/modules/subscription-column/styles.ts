import { IN_ELECTRON } from "@suhui/shared/constants"
import { clsx } from "@suhui/utils/utils"

export const feedColumnStyles = {
  item: clsx(
    !IN_ELECTRON && tw`duration-200 hover:bg-theme-item-hover`,
    tw`flex w-full cursor-menu items-center rounded-md pr-2.5 text-base lg:text-sm font-medium !leading-loose`,
    tw`data-[active=true]:bg-theme-item-active`,
  ),
}
