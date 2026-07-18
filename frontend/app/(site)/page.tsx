import type { Metadata } from "next";
import MDXContent from "@lib/MDXContent";
import pageMeta from "@content/meta";
import getRSS from "@lib/generateRSS";
import generateSitemap from "@lib/sitemap";
import HomeClient from "@components/site/HomeClient";

export const metadata: Metadata = {
  description: pageMeta.home.description,
  keywords: pageMeta.home.keywords,
  openGraph: { images: [{ url: pageMeta.home.image }] },
};

export default async function HomePage() {
  const blogs = new MDXContent("posts").getAllPosts(3);
  // Build-time side effects carried over from the old getStaticProps: write
  // public/feed.xml + public/sitemap.xml (static page => runs once per build).
  await getRSS();
  await generateSitemap();
  return <HomeClient blogs={blogs} />;
}
