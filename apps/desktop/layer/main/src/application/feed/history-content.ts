import { readabilityFromHtml } from "@suhui/readability"
import { DOMParser } from "linkedom/worker"

/** No script execution or secondary fetch occurs while extracting history content. */
export const extractHistoryContent = (html: string, url: string) => {
  const document = new DOMParser().parseFromString(html, "text/html")
  for (const node of document.querySelectorAll(
    "script, style, iframe, object, embed, form, link, base",
  ))
    node.remove()
  for (const node of document.querySelectorAll("*")) {
    for (const attribute of node.attributes) {
      if (/^on/i.test(attribute.name) || attribute.name === "srcdoc")
        node.removeAttribute(attribute.name)
    }
  }
  const result = readabilityFromHtml(url, document.toString())
  if (!result?.content || !result.textContent?.trim()) throw new Error("无法提取历史文章正文")
  return result.content
}
