import type { Metadata } from "next";
import KeysClient from "./KeysClient";

export const metadata: Metadata = { title: "Keys" };

export default function PlatformAdminKeysPage() {
  return <KeysClient />;
}
