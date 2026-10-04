/**
 * The reading measure for long-form prose: blog posts, snippets and the static pages. DESIGN.md asks for
 * 65-75 characters per line, and that is characters, not the CSS `ch` unit: `ch` is the width of "0",
 * about 1.25 average characters of Inter, so 54ch measured 67-73 characters per line on a post, a snippet
 * and /privacy, where 68ch measured 84-88. Each direct child of the prose body is held to the measure,
 * except what is not running text and may use the container's width:
 * - `figure` (rehype-pretty-code wraps every code block in one) and `table`;
 * - a `p` that holds an image and whose only element children are images, links and line breaks, i.e. a
 *   plot, chart or badge row. CSS cannot see text nodes, so a paragraph of text plus an inline image or a
 *   text link would also be exempt; no current content has one (`:has()` cannot nest, so a stricter
 *   test is not expressible);
 * - `iframe`, and the embed components: YouTube, Codepen and CodeSandbox render a `div` whose child is an
 *   `iframe`, EmbedBlog renders an `a` card.
 * Every class is a complete literal string so Tailwind's scanner finds it.
 */
export const PROSE_MEASURE =
  "max-w-none [&>*]:max-w-[54ch] [&>figure]:max-w-none [&>table]:max-w-none [&>iframe]:max-w-none [&>a]:max-w-none [&>div:has(>iframe)]:max-w-none [&>p:has(img):not(:has(>:not(img,a,br)))]:max-w-none";
