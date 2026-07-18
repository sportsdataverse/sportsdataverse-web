import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SnippetLayout from "@layout/SnippetLayout";
import { MdxRenderer } from "@components/mdx/MdxRenderer";
import RegisterView from "@components/RegisterView";
import MDXContent from "@lib/MDXContent";
import type { PostType } from "@lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return new MDXContent("snippets").getSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = new MDXContent("snippets").getFrontMatter(slug);
  if (!meta) return {};
  return {
    title: meta.title,
    description: meta.excerpt,
    keywords: meta.keywords,
    openGraph: { images: [{ url: meta.image }], type: "article" },
  };
}

export default async function Snippet({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const raw = new MDXContent("snippets").getRawSource(slug);
  if (!raw) notFound();

  const snippet: PostType = {
    meta: raw.meta,
    tableOfContents: raw.tableOfContents,
  };

  return (
    <>
      <RegisterView slug={slug} />
      <SnippetLayout snippet={snippet}>
        <MdxRenderer source={raw.content} />
      </SnippetLayout>
    </>
  );
}
