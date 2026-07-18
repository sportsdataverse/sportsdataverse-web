import Link from "next/link";
import type { Metadata } from "next";
import MDXContent from "@lib/MDXContent";
import { getFormattedDate } from "@utils/date";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "We've been working on packages and content since 2020, mostly in Python, R, and Node.js.",
};

export default function BlogIndex() {
  const posts = new MDXContent("posts").getAllPosts();
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16">
      <p className="font-mono text-sm text-primary">the sdv blog</p>
      <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
        Blog
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Notes on sports data engineering — packages, pipelines, and analysis
        across Python, R, and Node.js. {posts.length} posts and counting.
      </p>
      <ul className="mt-12 space-y-10">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="group block">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h2 className="font-display text-xl font-semibold transition-colors group-hover:text-primary">
                  {post.title}
                </h2>
                <time className="shrink-0 font-mono text-xs text-muted-foreground">
                  {getFormattedDate(new Date(post.date))}
                </time>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {post.excerpt}
              </p>
              <p className="mt-2 font-mono text-xs text-muted-foreground/70">
                {post.readingTime.text}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
