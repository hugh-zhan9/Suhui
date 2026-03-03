import { MODE, ModeEnum } from "@follow/shared/constants"

const APP_ICON_SRC = "icon.png?v=20260303"

export const SettingAbout = () => {
  return (
    <div className="mx-auto mt-6 max-w-3xl">
      <div className="px-2 text-center">
        <div className="mb-6 flex justify-center">
          <img
            src={APP_ICON_SRC}
            alt="溯洄图标"
            className="size-20 rounded-2xl"
            onError={(event) => {
              event.currentTarget.src = "icon.svg"
            }}
          />
        </div>
        <h1 className="-mt-4 text-center text-3xl font-semibold">溯洄 (SuHui)</h1>
        {MODE !== ModeEnum.production && (
          <span className="block -translate-y-2 text-sm font-normal text-text-tertiary">
            {MODE}
          </span>
        )}
        <p className="mt-2 text-sm text-text-secondary">溯源而读，回归纯粹</p>
      </div>
    </div>
  )
}
