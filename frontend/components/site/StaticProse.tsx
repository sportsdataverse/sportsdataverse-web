"use client";

import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import PageTop from "@components/PageTop";
import { opacityVariant } from "@content/FramerMotionVariants";

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
    <section className="pageTop">
      <PageTop containerClass="mb-0" pageTitle={title}>
        {description}
      </PageTop>
      <AnimatedDiv
        variants={opacityVariant}
        className="max-w-full prose font-barlow dark:prose-invert prose-headings:scroll-mt-24 prose-a:text-primary prose-a:no-underline hover:prose-a:text-accent prose-a:transition-colors dark:prose-a:text-sky-300 prose-li:marker:text-primary dark:prose-li:marker:text-sky-300"
      >
        {children}
      </AnimatedDiv>
    </section>
  );
}
