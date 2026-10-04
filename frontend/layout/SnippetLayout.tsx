"use client";

import { opacityVariant } from "@content/FramerMotionVariants";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import PageHeader from "@components/site/PageHeader";
import { PostType } from "@lib/types";
import { snippetsImages } from "@utils/utils";
import Image from "next/image";

export default function SnippetLayout({
  snippet,
  children,
}: {
  snippet: PostType;
  children: JSX.Element;
}) {
  return (
    <section className="mt-[44px] md:mt-[60px]  relative !overflow-hidden">
      <section className="relative max-w-3xl p-5 mx-auto prose sm:pt-10 font-barlow dark:prose-invert">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <PageHeader compact title={snippet.meta.title}>
              {snippet.meta.excerpt}
            </PageHeader>
          </div>

          <div className="relative flex items-center justify-center w-12 h-12 p-1 overflow-hidden shrink-0">
            <Image
              className="m-0"
              src={snippetsImages[`${snippet.meta.image}`]}
              alt={snippet.meta.title}
              width={62}
              height={62}
            ></Image>
          </div>
        </div>

        <AnimatedDiv
          variants={opacityVariant}
          className="max-w-full prose-sm blog-container sm:prose-base prose-pre:shadow marker:text-foreground"
        >
          {children}
        </AnimatedDiv>
      </section>
    </section>
  );
}
