import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlogLayout from "@layout/BlogLayout";
import { MdxRenderer } from "@components/mdx/MdxRenderer";
import RegisterView from "@components/RegisterView";
import MDXContent from "@lib/MDXContent";
import type { PostType } from "@lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return new MDXContent("posts").getSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = new MDXContent("posts").getFrontMatter(slug);
  if (!meta) return {};
  return {
    title: meta.title,
    description: meta.excerpt,
    keywords: meta.keywords,
    openGraph: { images: [{ url: meta.image }], type: "article" },
    twitter: { card: "summary_large_image", images: [meta.image] },
  };
}

export default async function Post({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = new MDXContent("posts");
  const raw = content.getRawSource(slug);
  if (!raw) notFound();

  const { prev, next } = content.getAdjacentPosts(slug);
  const post: PostType = {
    meta: raw.meta,
    tableOfContents: raw.tableOfContents,
  };

  return (
    <>
      <RegisterView slug={slug} />
      <BlogLayout post={post} prev={prev} next={next}>
        <MdxRenderer source={raw.content} />
      </BlogLayout>
    </>
  );
}
