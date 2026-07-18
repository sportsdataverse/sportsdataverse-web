"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import BlogsSection from "@components/Home/BlogsSection";
import Contact from "@components/Contact";
import {
  FadeContainer,
  opacityVariant,
  popUp,
} from "@content/FramerMotionVariants";
import { homeProfileImage } from "@utils/utils";
import { Button } from "@components/ui/button";
import type { FrontMatter } from "@lib/types";

export default function HomeClient({ blogs }: { blogs: FrontMatter[] }) {
  return (
    <div className="relative max-w-4xl mx-auto 2xl:max-w-5xl 3xl:max-w-7xl">
      <motion.section
        initial="hidden"
        whileInView="visible"
        variants={FadeContainer}
        viewport={{ once: true }}
        className="grid min-h-screen py-20 place-content-center"
      >
        <div className="relative flex flex-col items-center w-full gap-10 mx-auto">
          <motion.div
            variants={popUp}
            className="relative flex items-center justify-center p-3 rounded-full w-44 h-44 xs:w-52 xs:h-52 before:absolute before:inset-0 before:border-t-4 before:border-b-4 before:border-black before:dark:border-white before:rounded-full before:animate-photo-spin"
          >
            <Image
              src={homeProfileImage}
              className="rounded-full shadow filter saturate-0.5"
              width={933}
              height={933}
              alt="cover Profile Image"
              quality={75}
              priority
            />
          </motion.div>

          <div className="flex flex-col w-full gap-3 p-5 text-center select-none ">
            <div className="flex flex-col gap-1">
              <motion.h1
                variants={opacityVariant}
                className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-3xl font-bold text-transparent lg:text-5xl font-sarina"
              >
                SportsDataverse
              </motion.h1>
              <motion.p
                variants={opacityVariant}
                className="font-medium text-xs md:text-sm lg:text-lg text-[#383838] dark:text-gray-200"
              >
                An open-source sports analytics and data organization.
              </motion.p>
            </div>

            <motion.p
              variants={opacityVariant}
              className=" text-[#474747] dark:text-gray-300 font-medium text-sm md:text-base text-center"
            >
              We provide utilities in Python, R, Node.js, etc.
            </motion.p>

            <motion.div
              variants={opacityVariant}
              className="flex justify-center pt-1"
            >
              <Button
                asChild
                variant="outline"
                className="border-primary/40 text-primary transition-colors hover:bg-primary hover:text-primary-foreground dark:text-sky-300 dark:hover:text-primary-foreground"
              >
                <Link href="/packages">Explore our packages &rarr;</Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.section>

      <div>
        <BlogsSection blogs={blogs} />
        <Contact />
      </div>
    </div>
  );
}
