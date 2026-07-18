import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import MDXComponents from "@components/MDXComponents";

/**
 * Server-side MDX renderer for the App Router. Same rehype chain as the old
 * `MDXContent.getPostFromSlug` serialize path (slug anchors, autolinked
 * headings, shiki one-dark-pro highlighting), but compiled in the RSC pass —
 * no client hydration cost for static prose.
 */
export function MdxRenderer({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={MDXComponents}
      options={{
        mdxOptions: {
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
