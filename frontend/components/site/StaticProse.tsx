"use client";

import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import PageHeader from "@components/site/PageHeader";
import { opacityVariant } from "@content/FramerMotionVariants";
import { PROSE_MEASURE } from "@lib/prose";

/** Client prose shell for MDX static pages; children are server-rendered. */
export default function StaticProse({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-16">
      <PageHeader title={title}>{description}</PageHeader>
      <AnimatedDiv
        variants={opacityVariant}
        className={`mt-10 ${PROSE_MEASURE} prose font-sans dark:prose-invert prose-headings:scroll-mt-24 prose-a:text-primary prose-a:no-underline hover:prose-a:text-accent prose-a:transition-colors dark:prose-a:text-sky-300 prose-li:marker:text-primary dark:prose-li:marker:text-sky-300`}
      >
        {children}
      </AnimatedDiv>
    </section>
  );
}
