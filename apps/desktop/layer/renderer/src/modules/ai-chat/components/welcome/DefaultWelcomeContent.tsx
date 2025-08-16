import type { EditorState, LexicalEditor } from "lexical"
import { m } from "motion/react"

import { useSettingModal } from "~/modules/settings/modal/use-setting-modal-hack"

interface DefaultWelcomeContentProps {
  onSend: (message: EditorState | string, editor: LexicalEditor | null) => void
  shortcuts: Array<{ id: string; name: string; prompt: string; enabled: boolean; hotkey?: string }>
  hasCustomPrompt?: boolean
  personalizePrompt?: string
}

const DEFAULT_SHORTCUTS = [
  "Generate today daily report",
  "Analyze my reading patterns",
  "Summarize recent articles",
  "What happened today",
]

export const DefaultWelcomeContent: React.FC<DefaultWelcomeContentProps> = ({
  onSend,
  shortcuts: enabledShortcuts,
  hasCustomPrompt,
  personalizePrompt,
}) => {
  const settingModalPresent = useSettingModal()

  return (
    <m.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      className="w-full space-y-8"
    >
      {/* Empty space placeholder for visual balance */}
      <div className="relative mx-auto h-36 max-w-2xl" />

      <div className="relative flex flex-wrap items-center justify-center gap-2">
        {/* Custom shortcuts first */}
        {enabledShortcuts.slice(0, 6).map((shortcut, index) => (
          <m.button
            key={shortcut.id}
            className="bg-material-medium hover:bg-material-thick border-border/50 hover:border-border text-text hover:text-text inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-all hover:shadow-sm active:scale-95"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => onSend(shortcut.prompt, null)}
            title={shortcut.hotkey ? `${shortcut.name} (${shortcut.hotkey})` : shortcut.name}
          >
            <i className="i-mgc-flash-cute-re text-xs" />
            {shortcut.name}
          </m.button>
        ))}

        {/* Default suggestions if no custom shortcuts or to fill remaining space */}
        {enabledShortcuts.length < 4 &&
          DEFAULT_SHORTCUTS.slice(0, 4 - enabledShortcuts.length).map((suggestion, index) => (
            <m.button
              key={suggestion}
              className="bg-material-medium hover:bg-material-thick border-border/50 hover:border-border text-text hover:text-text inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-all hover:shadow-sm active:scale-95"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: (enabledShortcuts.length + index) * 0.1 }}
              onClick={() => onSend(suggestion, null)}
            >
              <i className="i-mgc-magic-cute-re text-xs" />
              {suggestion}
            </m.button>
          ))}

        {hasCustomPrompt && personalizePrompt && (
          <div className="bg-material-medium border-border absolute -bottom-4 mx-auto mt-2 w-full max-w-2xl translate-y-full rounded-lg border p-3 text-left">
            <div className="flex items-center justify-between">
              <div className="text-text-secondary mb-1 text-xs font-medium">Personal Prompt:</div>
              <button
                type="button"
                onClick={() => settingModalPresent("ai")}
                className="text-text-tertiary hover:text-text-secondary flex size-5 items-center justify-center rounded transition-colors"
                title="Edit in Settings"
              >
                <i className="i-mgc-edit-cute-re size-3.5" />
              </button>
            </div>
            <p className="text-text-secondary text-xs leading-relaxed">{personalizePrompt}</p>
          </div>
        )}
      </div>
    </m.div>
  )
}
