import { DBManager } from "~/manager/db"

export class UnreadApplicationService {
  async listUnreadCounts() {
    const db = DBManager.getDB()
    return db.query.unreadTable.findMany()
  }
}

export const unreadApplicationService = new UnreadApplicationService()
