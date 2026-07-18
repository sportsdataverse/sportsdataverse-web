"use client";

import { AnimatePresence } from "motion/react";
import { FadeContainer } from "@content/FramerMotionVariants";
import Blog from "@components/Blog";
import AnimatedDiv from "@components/FramerMotion/AnimatedDiv";
import PageTop from "@components/PageTop";
import useBookmarkBlogs from "@hooks/useBookmarkBlogs";

export default function BookmarkList() {
  const { bookmarkedBlogs } = useBookmarkBlogs("blogs", []);

  return (
    <section className="flex flex-col gap-2 pageTop text-foreground">
      <PageTop pageTitle="Bookmarks">
        Here you can find article bookmarked by you for later use.
      </PageTop>

      <section className="relative py-5 px-2 flex flex-col gap-2 min-h-[50vh]">
        <AnimatePresence>
          {bookmarkedBlogs?.length != 0 ? (
            <AnimatedDiv
              variants={FadeContainer}
              className="grid grid-cols-1 gap-4 mx-auto"
            >
              {bookmarkedBlogs?.map((blog, index) => {
                return <Blog key={index} blog={blog} />;
              })}
            </AnimatedDiv>
          ) : (
            <div className="mt-10 font-medium text-center font-inter text-muted-foreground">
              Nothing to see here.
            </div>
          )}
        </AnimatePresence>
      </section>
    </section>
  );
}
