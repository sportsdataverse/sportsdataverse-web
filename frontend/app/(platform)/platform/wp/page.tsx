import type { Metadata } from "next";
import WpClient from "./WpClient";

export const metadata: Metadata = { title: "Win probability" };

export default function PlatformWpPage() {
  return <WpClient />;
}
