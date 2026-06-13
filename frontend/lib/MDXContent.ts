import path from "path";
import { readFileSync, readdirSync } from "fs";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import readTime from "reading-time";
import rehypePrettyCode from "rehype-pretty-code";
import { FrontMatter } from "./types";

export default class MDXContent {
  private POST_PATH: string;
  constructor(folderName: string) {
    this.POST_PATH = path.join(process.cwd(), folderName);
  }

  getSlugs() {
    return readdirSync(this.POST_PATH)
      .filter((fileName) => fileName.endsWith(".mdx"))
      .map((fileName) => fileName.replace(/\.mdx$/, ""));
  }

  getFrontMatter(slug: string): FrontMatter | null {
    const postPath = path.join(this.POST_PATH, `${slug}.mdx`);
    const source = readFileSync(postPath);
    const { content, data } = matter(source);
    const readingTime = readTime(content);

    if (!data.published) return null;

    return {
      slug,
      readingTime,
      excerpt: data.excerpt ?? "",
      title: data.title ?? slug,
      date: (data.date ?? new Date()).toString(),
      author: data.author,
      keywords: data.keywords ?? "",
      image: data.image ?? "https://raw.githubusercontent.com/saiemgilani/saiem-blog/main/public/logo/cover.png",
    };
  }

  async getPostFromSlug(slug: string, force: boolean = false) {
    const postPath = path.join(this.POST_PATH, `${slug}.mdx`);
    const source = readFileSync(postPath);
    const { content, data } = matter(source);
    if (!data.published && !force) return { post: null };

    const frontMatter = this.getFrontMatter(slug);

    // rehype-pretty-code 0.14 (shiki 1.x): the onVisit* callbacks were removed;
    // line/word highlighting is now emitted as data-* attributes and styled via CSS.
    const prettyCodeOptions = {
      theme: "one-dark-pro",
      keepBackground: false,
    };
    const mdxSource = await serialize(content, {
      mdxOptions: {
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behaviour: "wrap" }],
          [rehypePrettyCode, prettyCodeOptions],
        ],
      },
    });
    return {
      post: {
        source: mdxSource,
        tableOfContents: this.getTableOfContents(content),
        meta: frontMatter,
      },
    };
  }

  getAllPosts(length?: number | undefined) {
    const allPosts = this.getSlugs()
      .map((slug) => {
        return this.getFrontMatter(slug);
      })
      .filter((post) => post !== null) // Filter post if it is not published
      .sort((a, b) => {
        if (new Date(a!.date) > new Date(b!.date)) return -1;
        if (new Date(a!.date) < new Date(b!.date)) return 1;
        return 0;
      });

    return length === undefined ? allPosts : allPosts.slice(0, length);
  }

  /**
   * Adjacent posts for tail navigation. `getAllPosts()` is sorted newest-first,
   * so the *older* (chronologically previous) post sits one slot further down
   * and the *newer* (next) post one slot up. Returns minimal {slug, title}
   * link data (or null at the ends of the list).
   */
  getAdjacentPosts(slug: string) {
    const all = this.getAllPosts();
    const index = all.findIndex((post) => post?.slug === slug);
    if (index === -1) return { prev: null, next: null };
    const toLink = (post: FrontMatter | null | undefined) =>
      post ? { slug: post.slug, title: post.title } : null;
    return {
      prev: toLink(all[index + 1]), // older post
      next: toLink(all[index - 1]), // newer post
    };
  }

  getTableOfContents(markdown: string) {
    const regXHeader = /#{2,6}.+/g;
    const headingArray = markdown.match(regXHeader)
      ? markdown.match(regXHeader)
      : [];
    return headingArray?.map((heading) => {
      return {
        level: heading.split("#").length - 1 - 2, // we starts from the 2nd heading that's why we subtract 2 and 1 is extra heading text
        heading: heading.replace(/#{2,6}/, "").trim(),
      };
    });
  }
}
