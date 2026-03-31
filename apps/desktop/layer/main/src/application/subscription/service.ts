import { SubscriptionService } from "@suhui/database/services/subscription"

export class SubscriptionApplicationService {
  async listSubscriptions() {
    return SubscriptionService.getSubscriptionAll()
  }

  async createSubscription(payload: {
    url: string
    view: number
    category?: string
    title?: string
  }) {
    const { DbService } = await import("~/ipc/services/db")
    return new DbService().addFeed({} as never, payload)
  }

  async deleteSubscription(subscriptionId: string) {
    if (!subscriptionId) return

    await SubscriptionService.delete(subscriptionId)
  }
}

export const subscriptionApplicationService = new SubscriptionApplicationService()
