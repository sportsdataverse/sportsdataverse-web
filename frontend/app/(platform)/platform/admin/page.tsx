import type { Metadata } from "next";
import AdminOverviewClient from "./AdminOverviewClient";

export const metadata: Metadata = { title: "Admin" };

export default function PlatformAdminPage() {
  return <AdminOverviewClient />;
}
