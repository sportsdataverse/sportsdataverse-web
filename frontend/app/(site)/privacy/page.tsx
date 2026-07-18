import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MDXContent from "@lib/MDXContent";
import pageMeta from "@content/meta";
import { MdxRenderer } from "@components/mdx/MdxRenderer";
import StaticProse from "@components/site/StaticProse";

export const metadata: Metadata = {
  title: pageMeta.privacy.title || "Privacy Policy",
  description: pageMeta.privacy.description,
  keywords: pageMeta.privacy.keywords,
};

export default function PrivacyPage() {
  const raw = new MDXContent("static_pages").getRawSource("privacy-policy", true);
  if (!raw) notFound();
  return (
    <StaticProse title={raw.meta.title} description={raw.meta.excerpt}>
      <MdxRenderer source={raw.content} />
    </StaticProse>
  );
}
