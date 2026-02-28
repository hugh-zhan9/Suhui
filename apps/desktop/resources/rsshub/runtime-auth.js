export const hasValidToken = ({ requestUrl: _requestUrl, headers: _headers, token: _token }) => {
  // FreeFolo 本地模式：默认关闭 token 限制，仅允许本机 127.0.0.1 访问由上层控制。
  return true
}
