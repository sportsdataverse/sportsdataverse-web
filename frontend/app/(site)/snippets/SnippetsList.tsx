"use client";

import { AnimatePresence } from "motion/react";
import { FadeContainer } from "@content/FramerMotionVariants";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import PageTop from "@components/PageTop";
import SnippetCard from "@components/SnippetCard";
import type { FrontMatter } from "@lib/types";

// Language sections, in display order. A snippet lands in a section when its
// frontmatter `image` matches the key; everything else collects under "More".
const SECTIONS: { key: string; label: string; note: string }[] = [
  { key: "r", label: "R", note: "cfbfastR · hoopR · wehoop · baseballr · fastRhockey" },
  { key: "python", label: "Python", note: "sportsdataverse-py" },
  { key: "node", label: "Node.js", note: "sportsdataverse.js" },
];

function SnippetGrid({ items }: { items: FrontMatter[] }) {
  return (
    <AnimatedDiv
      variants={FadeContainer}
      className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <AnimatePresence>
        {items.map((snippet) => (
          <SnippetCard key={snippet.slug} snippet={snippet} />
        ))}
      </AnimatePresence>
    </AnimatedDiv>
  );
}

export default function SnippetsList({
  snippets,
  description,
}: {
  snippets: FrontMatter[];
  description: string;
}) {
  const byKey = (key: string) =>
    snippets
      .filter((s) => s.image === key)
      .sort((a, b) => a.title.localeCompare(b.title));
  const other = snippets.filter(
    (s) => !SECTIONS.some((sec) => sec.key === s.image)
  );

  return (
    <section className="pageTop flex flex-col gap-2">
      <PageTop pageTitle="Snippets">{description}</PageTop>

      {SECTIONS.map((sec) => {
        const items = byKey(sec.key);
        if (items.length === 0) return null;
        return (
          <section key={sec.key} className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-3xl font-bold uppercase tracking-tight">
                {sec.label}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                {String(items.length).padStart(2, "0")} · {sec.note}
              </span>
            </div>
            <SnippetGrid items={items} />
          </section>
        );
      })}

      {other.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight">
              More
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              {String(other.length).padStart(2, "0")} · web &amp; tooling
            </span>
          </div>
          <SnippetGrid items={other} />
        </section>
      )}
    </section>
  );
}
