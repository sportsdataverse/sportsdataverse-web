import type { Metadata } from "next";
import PageHeader from "@components/site/PageHeader";
import QuestionFlow from "@components/site/QuestionFlow";
import { packageOptions } from "@lib/packageOptions";

export const metadata: Metadata = {
  title: "Survey",
  description: "Three minutes on who you are, what you use, and how you'd like to hear from us. Anonymous.",
};

export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  const dynamicOptions = await packageOptions();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      <PageHeader eyebrow="Anonymous" title="Tell us who you are">
        Three minutes, no account, no email. Your answers decide what we build and where we post.
      </PageHeader>
      <div className="mt-10">
        <QuestionFlow mode="survey" dynamicOptions={dynamicOptions} />
      </div>
    </div>
  );
}
