import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import MDXComponents from "@components/MDXComponents";

// The page's only <h1> is its PageHeader title, so a `# Heading` inside a post, snippet or static
// page renders one level down.
const components = {
  ...MDXComponents,
  h1: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
};

/**
 * Server-side MDX renderer for the App Router. Same rehype chain as the old
 * `MDXContent.getPostFromSlug` serialize path (slug anchors, autolinked
 * headings, shiki one-dark-pro highlighting), but compiled in the RSC pass —
 * no client hydration cost for static prose. remark-gfm adds GitHub-flavored
 * Markdown (pipe tables, strikethrough, task lists, footnotes, bare-URL links).
 */
export function MdxRenderer({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={components}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            rehypeSlug,
            [rehypeAutolinkHeadings, { behaviour: "wrap" }],
            [rehypePrettyCode, { theme: "one-dark-pro", keepBackground: false }],
          ],
        },
      }}
    />
  );
}
