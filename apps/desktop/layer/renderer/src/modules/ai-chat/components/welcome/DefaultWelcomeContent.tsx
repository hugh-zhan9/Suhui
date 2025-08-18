import { AIShortcutButton } from "@follow/components/ui/ai-shortcut-button/index.js"
import type { EditorState, LexicalEditor } from "lexical"
import { m } from "motion/react"

interface DefaultWelcomeContentProps {
  onSend: (message: EditorState | string, editor: LexicalEditor | null) => void
  shortcuts: Array<{ id: string; name: string; prompt: string; enabled: boolean; hotkey?: string }>
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
}) => {
  return (
    <m.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      className="w-full space-y-8"
    >
      <div className="relative flex flex-wrap items-center justify-center gap-2">
        {/* Custom shortcuts first */}
        {enabledShortcuts.slice(0, 6).map((shortcut, index) => (
          <AIShortcutButton
            key={shortcut.id}
            onClick={() => onSend(shortcut.prompt, null)}
            animationDelay={index * 0.1}
            title={shortcut.hotkey ? `${shortcut.name} (${shortcut.hotkey})` : shortcut.name}
          >
            {shortcut.name}
          </AIShortcutButton>
        ))}

        {/* Default suggestions if no custom shortcuts or to fill remaining space */}
        {enabledShortcuts.length < 4 &&
          DEFAULT_SHORTCUTS.slice(0, 4 - enabledShortcuts.length).map((suggestion, index) => (
            <AIShortcutButton
              key={suggestion}
              onClick={() => onSend(suggestion, null)}
              animationDelay={(enabledShortcuts.length + index) * 0.1}
            >
              {suggestion}
            </AIShortcutButton>
          ))}
      </div>
    </m.div>
  )
}
