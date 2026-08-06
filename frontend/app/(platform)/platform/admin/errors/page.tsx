import type { Metadata } from "next";
import ErrorsClient from "./ErrorsClient";

export const metadata: Metadata = { title: "Errors" };

export default function PlatformAdminErrorsPage() {
  return <ErrorsClient />;
}
