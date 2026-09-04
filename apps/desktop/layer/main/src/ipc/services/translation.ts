import type { GenerateEntryTranslationInput, TranslateTextInput } from "@suhui/shared"
import {
  TRANSLATION_PROGRESS_CHANNEL,
  type TranslationProviderConfigInput,
} from "@suhui/shared/translation"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { entryTranslationApplicationService } from "~/application/translation/service"

export class TranslationIpcService extends IpcService {
  static override readonly groupName = "translation"

  @IpcMethod()
  getConfig(_context: IpcContext) {
    return entryTranslationApplicationService.getConfig()
  }

  @IpcMethod()
  setConfig(_context: IpcContext, input: TranslationProviderConfigInput) {
    return entryTranslationApplicationService.setConfig(input)
  }

  @IpcMethod()
  testConfig(_context: IpcContext) {
    return entryTranslationApplicationService.testConfig()
  }

  @IpcMethod()
  translateText(_context: IpcContext, input: TranslateTextInput) {
    return entryTranslationApplicationService.translateText(input)
  }

  @IpcMethod()
  generate(context: IpcContext, input: GenerateEntryTranslationInput) {
    return entryTranslationApplicationService.generate(input, (progress) => {
      try {
        if (context.sender.isDestroyed?.() !== true) {
          context.sender.send(TRANSLATION_PROGRESS_CHANNEL, progress)
        }
      } catch {
        // Progress is best-effort when the invoking renderer is closing. The final cache remains valid.
      }
    })
  }
}
