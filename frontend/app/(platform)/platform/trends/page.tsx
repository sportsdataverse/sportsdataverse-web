import type { Metadata } from "next";
import TrendsClient from "./TrendsClient";

export const metadata: Metadata = { title: "Trends" };

export default function PlatformTrendsPage() {
  return <TrendsClient />;
}
