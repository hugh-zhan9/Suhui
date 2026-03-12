# Discover API 诊断设计

- 目标：为 Trending/Discover 独立客户端增加临时诊断日志，定位请求失败发生在网络、HTTP、还是解析阶段。
- 范围：仅修改 renderer 层 discoverClient 相关代码，不动主阅读链路。
- 日志内容：请求前记录 method/baseURL/url/params；响应后记录 status/content-type/最终 URL/响应片段；失败时记录 axios 错误摘要、response.data 片段。
- 测试：新增最小单测，验证 discoverClient 挂载了诊断拦截器且不影响现有 client 创建。
