"use client";

import AnimatedHeading from "@components/FramerMotion/AnimatedHeading";
import { headingFromLeft } from "@content/FramerMotionVariants";

export function HomeHeading({ title }: { title: React.ReactNode | string }) {
  return (
    <AnimatedHeading
      className="w-full my-2 text-3xl font-bold text-left font-inter"
      variants={headingFromLeft}
    >
      {title}
    </AnimatedHeading>
  );
}

export default HomeHeading;
