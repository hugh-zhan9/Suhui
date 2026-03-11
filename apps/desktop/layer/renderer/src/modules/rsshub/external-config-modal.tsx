import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/index.js"
import { useState } from "react"

export const ExternalRsshubConfigModal = ({
  initialUrl,
  onSave,
  onUsePublic,
  onCancel,
}: {
  initialUrl: string
  onSave: (url: string) => void | Promise<void>
  onUsePublic: () => void | Promise<void>
  onCancel: () => void
}) => {
  const [url, setUrl] = useState(initialUrl)
  const trimmedUrl = url.trim()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        需要先配置外部 RSSHub 实例，才能订阅 RSSHub 路由。
      </p>
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://rsshub.example.com"
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="text" onClick={onUsePublic}>
          使用官方默认继续
        </Button>
        <Button variant="text" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={() => onSave(trimmedUrl)} disabled={!trimmedUrl}>
          保存并继续
        </Button>
      </div>
    </div>
  )
}
