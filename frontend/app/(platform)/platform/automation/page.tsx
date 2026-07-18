import type { Metadata } from "next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import AutomationClient from "./AutomationClient";
import PipelinesPanel from "@components/platform/orch/PipelinesPanel";

export const metadata: Metadata = { title: "Automation" };

export default function PlatformAutomationPage() {
  return (
    <Tabs defaultValue="pipelines">
      <TabsList className="mb-4">
        <TabsTrigger value="pipelines" className="font-mono text-xs">
          Pipelines
        </TabsTrigger>
        <TabsTrigger value="workflows" className="font-mono text-xs">
          GitHub Workflows
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pipelines">
        <PipelinesPanel />
      </TabsContent>
      <TabsContent value="workflows">
        <AutomationClient />
      </TabsContent>
    </Tabs>
  );
}
