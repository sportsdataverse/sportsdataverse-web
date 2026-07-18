"use client";

import { AnimatePresence } from "motion/react";
import { FadeContainer } from "@content/FramerMotionVariants";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import PageTop from "@components/PageTop";
import SnippetCard from "@components/SnippetCard";
import type { FrontMatter } from "@lib/types";

export default function SnippetsList({
  snippets,
  description,
}: {
  snippets: FrontMatter[];
  description: string;
}) {
  return (
    <section className="pageTop flex flex-col gap-2">
      <PageTop pageTitle="Snippets">{description}</PageTop>

      <section className="relative flex flex-col gap-2 min-h-[50vh]">
        <AnimatedDiv
          variants={FadeContainer}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full"
        >
          <AnimatePresence>
            {snippets.map((snippet, index) => {
              return <SnippetCard key={index} snippet={snippet} />;
            })}
          </AnimatePresence>
        </AnimatedDiv>
      </section>
    </section>
  );
}
