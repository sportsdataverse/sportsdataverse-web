import type { Metadata } from "next";
import AutomationClient from "./AutomationClient";

export const metadata: Metadata = { title: "Automation" };

export default function PlatformAutomationPage() {
  return <AutomationClient />;
}
