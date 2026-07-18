import type { Metadata } from "next";
import LookupsClient from "./LookupsClient";

export const metadata: Metadata = { title: "Lookups" };

export default function PlatformLookupsPage() {
  return <LookupsClient />;
}
