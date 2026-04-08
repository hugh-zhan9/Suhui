import { SubscriptionService } from "@suhui/database/services/subscription"
import { FeedService } from "@suhui/database/services/feed"
import { InboxService } from "@suhui/database/services/inbox"
import { ListService } from "@suhui/database/services/list"

export class SubscriptionApplicationService {
  async listSubscriptions() {
    const subscriptions = await SubscriptionService.getSubscriptionAll()

    const [feeds, lists, inboxes] = await Promise.all([
      FeedService.getFeedAll(),
      ListService.getListAll(),
      InboxService.getInboxAll(),
    ])

    const feedTitleById = new Map(feeds.map((feed) => [feed.id, feed.title ?? null]))
    const listTitleById = new Map(lists.map((list) => [list.id, list.title ?? null]))
    const inboxTitleById = new Map(inboxes.map((inbox) => [inbox.id, inbox.title ?? null]))

    return subscriptions.map((subscription) => {
      if (subscription.title) return subscription

      let fallbackTitle: string | null = null

      if (subscription.type === "feed" && subscription.feedId) {
        fallbackTitle = feedTitleById.get(subscription.feedId) ?? null
      } else if (subscription.type === "list" && subscription.listId) {
        fallbackTitle = listTitleById.get(subscription.listId) ?? null
      } else if (subscription.type === "inbox" && subscription.inboxId) {
        fallbackTitle = inboxTitleById.get(subscription.inboxId) ?? null
      }

      return {
        ...subscription,
        title: fallbackTitle,
      }
    })
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

  async updateSubscription(
    subscriptionId: string,
    payload: {
      title?: string | null
      category?: string | null
      view?: number
    },
  ) {
    await SubscriptionService.patch({
      id: subscriptionId,
      ...payload,
    })

    return SubscriptionService.getSubscriptionAll().then(
      (subscriptions) =>
        subscriptions.find((subscription) => subscription.id === subscriptionId) || null,
    )
  }
}

export const subscriptionApplicationService = new SubscriptionApplicationService()
