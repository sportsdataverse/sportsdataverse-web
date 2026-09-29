import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import type { TableOfContents } from "./types";

/**
 * Table of contents for an MDX body, built from the same parse the renderer
 * uses (remark-mdx + remark-gfm, see components/mdx/MdxRenderer.tsx), so fenced
 * code is skipped and labels are plain text. Slugs replay rehype-slug: one
 * github-slugger per document fed EVERY heading (h1 included) in document
 * order, so repeats get the same `-1`/`-2` suffixes as the rendered ids.
 * Only h2-h6 are listed; `level` is 0 for h2.
 */
export function getTableOfContents(markdown: string): TableOfContents[] {
  const tree = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).parse(markdown);
  const slugger = new GithubSlugger();
  const toc: TableOfContents[] = [];
  visit(tree, "heading", (node) => {
    // hast-util-to-string (what rehype-slug reads) has no image alt text
    const heading = toString(node, { includeImageAlt: false });
    const slug = slugger.slug(heading);
    if (node.depth >= 2) toc.push({ level: node.depth - 2, heading, slug });
  });
  return toc;
}
