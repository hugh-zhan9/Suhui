import { cn } from "@follow/utils"
import { memo, useMemo } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu/dropdown-menu"

import { useAIModel } from "../../hooks/useAIModel"

interface AIModelIndicatorProps {
  className?: string
  onModelChange?: (model: string) => void
}

type ProviderType = "openai" | "anthropic" | "google" | "meta"

const providerIcons: Record<ProviderType, string> = {
  openai: "i-simple-icons-openai",
  anthropic: "i-simple-icons-anthropic",
  google: "i-simple-icons-google",
  meta: "i-simple-icons-meta",
}

const parseModelString = (modelString: string) => {
  if (!modelString || !modelString.includes("/")) {
    return { provider: "openai" as ProviderType, modelName: modelString || "Unknown" }
  }

  const [provider, ...modelParts] = modelString.split("/")
  const modelName = modelParts.join("/")

  return {
    provider: (provider as ProviderType) || "openai",
    modelName: modelName || "Unknown",
  }
}

export const AIModelIndicator = memo(({ className, onModelChange }: AIModelIndicatorProps) => {
  const { data } = useAIModel()
  const { currentModel, availableModels = [] } = data || {}

  const { provider, modelName } = useMemo(() => {
    return parseModelString(currentModel || "")
  }, [currentModel])

  const iconClass = providerIcons[provider] || providerIcons.openai
  const hasMultipleModels = availableModels && availableModels.length > 1

  const modelContent = (
    <div
      className={cn(
        "inline-flex items-center rounded-full border font-medium backdrop-blur-sm transition-colors",
        hasMultipleModels
          ? "hover:bg-material-medium cursor-pointer"
          : "hover:bg-material-medium/50",
        "duration-200",
        "gap-1.5 px-2 py-1 text-xs",
        "bg-material-ultra-thin border-border/50",
        "text-text-secondary",

        className,
      )}
    >
      <i className={cn("size-3", iconClass)} />
      <span className="max-w-20 truncate">{modelName}</span>
      {hasMultipleModels && <i className="i-mingcute-down-line size-3 opacity-60" />}
    </div>
  )

  if (!hasMultipleModels) {
    return modelContent
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{modelContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {availableModels.map((model) => {
          const { provider: itemProvider, modelName: itemModelName } = parseModelString(model)
          const itemIconClass = providerIcons[itemProvider] || providerIcons.openai
          const isSelected = model === currentModel

          return (
            <DropdownMenuItem
              key={model}
              className="gap-2"
              onClick={() => onModelChange?.(model)}
              checked={isSelected}
            >
              <i className={cn("size-3", itemIconClass)} />
              <span className="truncate">{itemModelName}</span>
              {isSelected && <i className="i-mgc-check-cute-re text-accent ml-auto size-3" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

AIModelIndicator.displayName = "AIModelIndicator"
