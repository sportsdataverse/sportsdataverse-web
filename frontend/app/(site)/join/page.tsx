import type { Metadata } from "next";
import PageHeader from "@components/site/PageHeader";
import QuestionFlow from "@components/site/QuestionFlow";
import { packageOptions } from "@lib/packageOptions";

export const metadata: Metadata = {
  title: "Join",
  description: "Tell us a little about yourself and pick what you want from us: the newsletter, a Discord invite, or both.",
};

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const dynamicOptions = await packageOptions();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      <PageHeader eyebrow="Community" title="Join the SportsDataverse">
        A few questions about what you do and use, then choose the newsletter, a Discord invite, or both.
      </PageHeader>
      <div className="mt-10">
        <QuestionFlow mode="join" dynamicOptions={dynamicOptions} />
      </div>
    </div>
  );
}
