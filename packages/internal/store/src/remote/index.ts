/**
 * 远程端 Store 适配层
 * 提供运行时环境检测、数据转换、初始化和 SSE 事件处理
 */

export { getRuntimeEnv, markRemoteRuntime } from "./env"
export {
  type SubscriptionRecord,
  type EntryRecord,
  type UnreadRecord,
  transformSubscriptionFromApi,
  transformEntryFromApi,
  transformUnreadFromApi,
  transformSubscriptionsFromApi,
  transformEntriesFromApi,
  transformUnreadsFromApi,
  extractFeedsFromSubscriptions,
} from "./transforms"
export { hydrateFromRemote, resetRemoteStore, type RemoteHydrateStatus } from "./hydrate"
export { remoteSSEHandler } from "./sse-handler"
