/**
 * 远程端 Store 适配层
 * 提供运行时环境检测、数据转换、初始化和 SSE 事件处理
 */

export { getRuntimeEnv, markRemoteRuntime } from "./env"
export {
  applyRemoteBootstrapInSession,
  beginRemoteBootstrapLoading,
  failRemoteBootstrapLoading,
  resetRemoteBootstrapStores,
  useRemoteBootstrapStore,
  type RemoteBootstrapPayload,
  type RemoteBootstrapPhase,
  type RemoteBootstrapState,
  type RemoteSettings,
} from "./bootstrap"
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
  parseRemoteBootstrapPayload,
  transformRemoteBootstrapFromApi,
  extractFeedsFromSubscriptions,
} from "./transforms"
export { remoteSSEHandler } from "./sse-handler"
