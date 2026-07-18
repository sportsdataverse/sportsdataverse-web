import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MDXContent from "@lib/MDXContent";
import pageMeta from "@content/meta";
import { MdxRenderer } from "@components/mdx/MdxRenderer";
import StaticProse from "@components/site/StaticProse";
import Contact from "@components/Contact";

export const metadata: Metadata = {
  title: pageMeta.about.title || "About",
  description: pageMeta.about.description,
  keywords: pageMeta.about.keywords,
  openGraph: { images: [{ url: pageMeta.about.image }] },
};

export default function AboutPage() {
  const raw = new MDXContent("static_pages").getRawSource("about", true);
  if (!raw) notFound();
  return (
    <>
      <StaticProse title={raw.meta.title}>
        <MdxRenderer source={raw.content} />
      </StaticProse>
      <div className="relative max-w-4xl mx-auto 2xl:max-w-5xl 3xl:max-w-7xl">
        <Contact />
      </div>
    </>
  );
}
