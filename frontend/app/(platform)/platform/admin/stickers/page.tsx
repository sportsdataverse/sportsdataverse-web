import type { Metadata } from "next";
import StickersClient from "./StickersClient";

export const metadata: Metadata = { title: "Stickers" };

export default function PlatformAdminStickersPage() {
  return <StickersClient />;
}
