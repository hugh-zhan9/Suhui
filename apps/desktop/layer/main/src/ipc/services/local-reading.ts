import { readFile, writeFile } from "node:fs/promises"

import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { annotationApplicationService } from "~/application/annotations/service"
import { backupApplicationService } from "~/application/backup/service"
import { dbConversionApplicationService } from "~/application/db-conversion/service"
import { dedupApplicationService } from "~/application/dedup/service"
import { opmlApplicationService } from "~/application/opml/service"
import { readingQueueApplicationService } from "~/application/reading-queue/service"
import { ruleApplicationService } from "~/application/rules/service"
import { DBManager } from "~/manager/db"

export class LocalReadingService extends IpcService {
  static override readonly groupName = "localReading"

  @IpcMethod()
  async exportBackup(
    _context: IpcContext,
    path: string,
    rendererSettings?: Record<string, string>,
  ) {
    await DBManager.waitUntilUsable()
    return backupApplicationService.exportToFile(path, undefined, rendererSettings)
  }

  @IpcMethod()
  async validateBackup(_context: IpcContext, path: string) {
    await DBManager.waitUntilUsable()
    return backupApplicationService.validateFile(path)
  }

  @IpcMethod()
  async prepareReplaceBackup(_context: IpcContext, path: string) {
    await DBManager.waitUntilUsable()
    return backupApplicationService.prepareReplace(path)
  }

  @IpcMethod()
  async restoreBackup(
    _context: IpcContext,
    input: {
      path: string
      mode: "merge" | "replace"
      confirmationToken?: string
      rendererSettings?: Record<string, string>
    },
  ) {
    await DBManager.waitUntilUsable()
    const finishMaintenance = await DBManager.beginMaintenance()
    try {
      return await backupApplicationService.restoreFromFile(input)
    } finally {
      await finishMaintenance()
    }
  }

  @IpcMethod()
  async convertDatabase(
    _context: IpcContext,
    input: {
      to: "postgres" | "sqlite"
      targetDbConn?: string
      targetDbUser?: string
      targetDbPassword?: string
    },
  ) {
    await DBManager.waitUntilUsable()
    return dbConversionApplicationService.convert(input)
  }

  @IpcMethod()
  async getPendingRendererSettings() {
    await DBManager.waitUntilUsable()
    return backupApplicationService.getPendingRendererSettings()
  }

  @IpcMethod()
  async acknowledgeRendererSettings() {
    await DBManager.waitUntilUsable()
    await backupApplicationService.markRendererSettingsApplied()
  }

  @IpcMethod()
  async previewOpml(_context: IpcContext, xml: string) {
    await DBManager.waitUntilUsable()
    return opmlApplicationService.preview(xml)
  }

  @IpcMethod()
  async importOpml(_context: IpcContext, input: { xml: string; selectedIndexes?: number[] }) {
    await DBManager.waitUntilUsable()
    return opmlApplicationService.import(input.xml, input.selectedIndexes)
  }

  @IpcMethod()
  async exportOpml(_context: IpcContext) {
    await DBManager.waitUntilUsable()
    return opmlApplicationService.export()
  }

  @IpcMethod()
  async importOpmlFile(_context: IpcContext, input: { path: string; selectedIndexes?: number[] }) {
    await DBManager.waitUntilUsable()
    return opmlApplicationService.import(await readFile(input.path, "utf8"), input.selectedIndexes)
  }

  @IpcMethod()
  async previewOpmlFile(_context: IpcContext, path: string) {
    await DBManager.waitUntilUsable()
    return opmlApplicationService.preview(await readFile(path, "utf8"))
  }

  @IpcMethod()
  async exportOpmlFile(_context: IpcContext, path: string) {
    await DBManager.waitUntilUsable()
    await writeFile(path, await opmlApplicationService.export(), { encoding: "utf8", mode: 0o600 })
    return { path }
  }

  @IpcMethod()
  async listRules() {
    await DBManager.waitUntilUsable()
    return ruleApplicationService.listRules()
  }

  @IpcMethod()
  async getEntryTags(_context: IpcContext, entryId: string) {
    await DBManager.waitUntilUsable()
    return ruleApplicationService.getTags(entryId)
  }

  @IpcMethod()
  async createRule(
    _context: IpcContext,
    input: Parameters<typeof ruleApplicationService.createRule>[0],
  ) {
    await DBManager.waitUntilUsable()
    return ruleApplicationService.createRule(input)
  }

  @IpcMethod()
  async updateRule(
    _context: IpcContext,
    id: string,
    input: Parameters<typeof ruleApplicationService.updateRule>[1],
  ) {
    await DBManager.waitUntilUsable()
    return ruleApplicationService.updateRule(id, input)
  }

  @IpcMethod()
  async deleteRule(_context: IpcContext, id: string) {
    await DBManager.waitUntilUsable()
    return ruleApplicationService.deleteRule(id)
  }

  @IpcMethod()
  async previewRuleHistory(_context: IpcContext, id: string) {
    await DBManager.waitUntilUsable()
    return ruleApplicationService.previewHistory(id)
  }

  @IpcMethod()
  async executeRuleHistory(_context: IpcContext, token: string) {
    await DBManager.waitUntilUsable()
    return ruleApplicationService.executeHistory(token)
  }

  @IpcMethod()
  async setEntryTags(
    _context: IpcContext,
    input: { entryId: string; add?: string[]; remove?: string[] },
  ) {
    await DBManager.waitUntilUsable()
    if (input.remove?.length) await ruleApplicationService.removeTags(input.entryId, input.remove)
    if (input.add?.length) return ruleApplicationService.addTags(input.entryId, input.add)
    return ruleApplicationService.getTags(input.entryId)
  }

  @IpcMethod()
  async setEntryHidden(_context: IpcContext, input: { entryId: string; hidden: boolean }) {
    await DBManager.waitUntilUsable()
    await ruleApplicationService.setHidden(input.entryId, input.hidden)
  }

  @IpcMethod()
  async rebuildClusters(_context: IpcContext, entryIds?: string[]) {
    await DBManager.waitUntilUsable()
    return dedupApplicationService.rebuild(entryIds)
  }

  @IpcMethod()
  async setClusterRepresentative(
    _context: IpcContext,
    input: { clusterId: string; entryId: string | null },
  ) {
    await DBManager.waitUntilUsable()
    await dedupApplicationService.setRepresentative(input.clusterId, input.entryId)
  }

  @IpcMethod()
  async splitClusterMember(_context: IpcContext, input: { clusterId: string; entryId: string }) {
    await DBManager.waitUntilUsable()
    await dedupApplicationService.splitMember(input.clusterId, input.entryId)
  }

  @IpcMethod()
  async listAnnotations(_context: IpcContext, entryId: string) {
    await DBManager.waitUntilUsable()
    return annotationApplicationService.list(entryId)
  }

  @IpcMethod()
  async createNote(_context: IpcContext, input: { entryId: string; content: string }) {
    await DBManager.waitUntilUsable()
    return annotationApplicationService.createNote(input.entryId, input.content)
  }

  @IpcMethod()
  async updateNote(
    _context: IpcContext,
    input: { id: string; content: string; expectedUpdatedAt: number },
  ) {
    await DBManager.waitUntilUsable()
    return annotationApplicationService.updateNote(input.id, input.content, input.expectedUpdatedAt)
  }

  @IpcMethod()
  async deleteNote(_context: IpcContext, id: string) {
    await DBManager.waitUntilUsable()
    await annotationApplicationService.deleteNote(id)
  }

  @IpcMethod()
  async createHighlight(
    _context: IpcContext,
    input: Parameters<typeof annotationApplicationService.createHighlight>[0],
  ) {
    await DBManager.waitUntilUsable()
    return annotationApplicationService.createHighlight(input)
  }

  @IpcMethod()
  async deleteHighlight(_context: IpcContext, id: string) {
    await DBManager.waitUntilUsable()
    await annotationApplicationService.deleteHighlight(id)
  }

  @IpcMethod()
  async relocateHighlights(_context: IpcContext, entryId: string) {
    await DBManager.waitUntilUsable()
    return annotationApplicationService.relocate(entryId)
  }

  @IpcMethod()
  async listReadingQueue(
    _context: IpcContext,
    input?: { status?: "pending" | "completed"; limit?: number },
  ) {
    await DBManager.waitUntilUsable()
    return readingQueueApplicationService.list(input?.status, input?.limit)
  }

  @IpcMethod()
  async addToReadingQueue(_context: IpcContext, entryId: string) {
    await DBManager.waitUntilUsable()
    return readingQueueApplicationService.add(entryId)
  }

  @IpcMethod()
  async completeReadingQueue(_context: IpcContext, entryId: string) {
    await DBManager.waitUntilUsable()
    return readingQueueApplicationService.complete(entryId)
  }

  @IpcMethod()
  async removeFromReadingQueue(_context: IpcContext, entryId: string) {
    await DBManager.waitUntilUsable()
    await readingQueueApplicationService.remove(entryId)
  }

  @IpcMethod()
  async getReadingQueueStats() {
    await DBManager.waitUntilUsable()
    return readingQueueApplicationService.stats()
  }
}
