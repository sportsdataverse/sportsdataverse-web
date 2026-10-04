/**
 * The reading measure for long-form prose: blog posts, snippets and the static pages. DESIGN.md asks for
 * 65-75 characters per line, and that is characters, not the CSS `ch` unit: `ch` is the width of "0",
 * about 1.25 average characters of Inter, so 54ch measured 67-73 characters per line on a post, a snippet
 * and /privacy, where 68ch measured 84-88. Each direct child of the prose body is held to the measure;
 * code blocks (rehype-pretty-code's <figure>) and tables may run wider, up to the container.
 */
export const PROSE_MEASURE = "max-w-none [&>*]:max-w-[54ch] [&>figure]:max-w-none [&>table]:max-w-none";
