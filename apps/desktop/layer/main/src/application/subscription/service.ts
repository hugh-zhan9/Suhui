import { SubscriptionService } from "@suhui/database/services/subscription"

export class SubscriptionApplicationService {
  async listSubscriptions() {
    return SubscriptionService.getSubscriptionAll()
  }
}

export const subscriptionApplicationService = new SubscriptionApplicationService()
