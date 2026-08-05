import type { Metadata } from "next";
import SiteClient from "./SiteClient";

export const metadata: Metadata = { title: "Site" };

export default function PlatformAdminSitePage() {
  return <SiteClient />;
}
