import { isTaggedFunctionCallOf } from "ast-kit"
import { RemoveWrapperFunction } from "unplugin-ast/transformers"
import AST from "unplugin-ast/vite"
// Custom transformer for tw function that compresses template strings
const TwTransformer = {
  // @ts-ignore
  onNode: (node) => isTaggedFunctionCallOf(node, ["tw"]),
  transform(node) {
    if (node.type === "TaggedTemplateExpression") {
      const { quasi } = node
      // Process template literals
      if (quasi.type === "TemplateLiteral") {
        // Get the raw string content
        const rawString = quasi.quasis[0]?.value?.raw || ""
        // Compress the string: remove extra whitespace, newlines, and normalize spaces
        const compressedString = rawString
          .replaceAll(/\s+/g, " ") // Replace multiple whitespace with single space
          .trim() // Remove leading and trailing whitespace
        // Update the template literal
        quasi.quasis[0].value.raw = compressedString
        quasi.quasis[0].value.cooked = compressedString
      }
      return quasi
    }
    return node.arguments[0]
  },
}
export const astPlugin = AST({
  transformer: [
    TwTransformer,
    RemoveWrapperFunction([
      "defineSettingPageData",
      "t_",
      "tShortcuts",
      "tSettings",
      "defineFollowCommand",
    ]),
  ],
})
