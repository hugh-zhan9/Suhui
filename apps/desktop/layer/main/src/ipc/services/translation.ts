import type { GenerateEntryTranslationInput, TranslationProviderConfigInput } from "@suhui/shared"
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
  generate(_context: IpcContext, input: GenerateEntryTranslationInput) {
    return entryTranslationApplicationService.generate(input)
  }
}
