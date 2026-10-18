import type { Metadata } from "next";
import OpsClient from "./OpsClient";

export const metadata: Metadata = { title: "Ops" };

export default function PlatformAdminOpsPage() {
  return <OpsClient />;
}
