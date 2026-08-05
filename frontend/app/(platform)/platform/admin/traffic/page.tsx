import type { Metadata } from "next";
import TrafficClient from "./TrafficClient";

export const metadata: Metadata = { title: "Traffic" };

export default function PlatformAdminTrafficPage() {
  return <TrafficClient />;
}
