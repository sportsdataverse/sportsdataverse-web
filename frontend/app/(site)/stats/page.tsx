import type { Metadata } from "next";
import pageMeta from "@content/meta";
import StatsClient from "./StatsClient";

export const metadata: Metadata = {
  title: pageMeta.stats.title,
  description: pageMeta.stats.description,
  keywords: pageMeta.stats.keywords,
  openGraph: { images: [{ url: pageMeta.stats.image }] },
};

export default function StatsPage() {
  return <StatsClient />;
}
