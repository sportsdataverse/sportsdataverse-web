"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import BlogsSection from "@components/Home/BlogsSection";
import { FadeContainer, opacityVariant, popUp } from "@content/FramerMotionVariants";
import { homeProfileImage } from "@utils/utils";
import { Button } from "@components/ui/button";
import type { FrontMatter } from "@lib/types";

const LANGS = [
  { label: "R", note: "cfbfastR · hoopR · wehoop · fastRhockey" },
  { label: "PY", note: "sportsdataverse-py · loaders · models" },
  { label: "JS", note: "sportsdataverse.js · web tooling" },
];

export default function HomeClient({ blogs }: { blogs: FrontMatter[] }) {
  return (
    <div className="relative mx-auto max-w-6xl px-4">
      <motion.section
        initial="hidden"
        whileInView="visible"
        variants={FadeContainer}
        viewport={{ once: true }}
        className="grid items-center gap-10 py-16 md:grid-cols-[1.4fr_1fr] md:py-24"
      >
        <div className="flex flex-col gap-6">
          <motion.p variants={opacityVariant} className="eyebrow">
            Open-source sports data
          </motion.p>
          <motion.h1
            variants={opacityVariant}
            className="font-display text-6xl font-bold uppercase leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl"
          >
            Every play.
            <br />
            Every league.
            <br />
            <span className="relative inline-block">
              Open.
              <span className="absolute -bottom-1 left-0 h-1.5 w-full bg-score" />
            </span>
          </motion.h1>
          <motion.p
            variants={opacityVariant}
            className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Play-by-play, box scores, betting lines, and win-probability models
            for college football, basketball, and beyond — shipped as free
            packages in R, Python, and Node.js, backed by an open data
            warehouse.
          </motion.p>
          <motion.div variants={opacityVariant} className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="/packages">
                Explore the packages <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="gap-1 text-muted-foreground hover:text-foreground">
              <Link href="/about">Who we are</Link>
            </Button>
          </motion.div>
          <motion.div
            variants={opacityVariant}
            className="mt-2 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {LANGS.map((l) => (
              <div
                key={l.label}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="font-display text-lg font-bold text-primary">
                  {l.label}
                </span>
                <p className="mt-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
                  {l.note}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div variants={popUp} className="hidden justify-center md:flex">
          <div className="relative flex size-64 items-center justify-center rounded-full border border-border bg-card p-6 shadow-sm lg:size-72">
            <span className="absolute -top-1.5 left-1/2 h-3 w-16 -translate-x-1/2 rounded-full bg-score" />
            <Image
              src={homeProfileImage}
              className="rounded-full"
              width={933}
              height={933}
              alt="SportsDataverse logo"
              quality={75}
              priority
            />
          </div>
        </motion.div>
      </motion.section>

      <BlogsSection blogs={blogs} />
    </div>
  );
}
