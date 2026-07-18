import type { Metadata } from "next";
import MDXContent from "@lib/MDXContent";
import pageMeta from "@content/meta";
import SnippetsList from "./SnippetsList";

export const metadata: Metadata = {
  title: pageMeta.snippets.title,
  description: pageMeta.snippets.description,
  keywords: pageMeta.snippets.keywords,
  openGraph: { images: [{ url: pageMeta.snippets.image }] },
};

export default function SnippetsPage() {
  const snippets = new MDXContent("snippets").getAllPosts();
  return (
    <SnippetsList
      snippets={snippets}
      description={pageMeta.snippets.description}
    />
  );
}
