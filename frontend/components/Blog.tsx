import Link from "next/link";
import { getFormattedDate } from "@utils/date";
import { FrontMatter } from "@lib/types";
import { useRef } from "react";
import Image from "next/image";
import { homeProfileImage } from "@utils/utils";
import { motion } from "motion/react";
import { BlogCardAnimation } from "@content/FramerMotionVariants";

export default function Blog({
  blog,
  animate = false,
}: {
  blog: FrontMatter;
  animate?: boolean;
}) {
  const blogRef = useRef(null);
  const authorName = blog.author?.name  ? blog.author.name : "SportsDataverse Contributor";
  const authorPicture = blog.author?.picture ? blog.author.picture : homeProfileImage;
  return (
    <motion.article
      ref={blogRef}
      variants={BlogCardAnimation}
      initial={animate && "hidden"}
      whileInView={animate ? "visible" : ""}
      viewport={{ once: true }}
      className="group bg-card rounded-2xl p-2 flex flex-col sm:flex-row items-center w-full sm:w-[95%] mx-auto gap-2 md:gap-7 shadow-md md:shadow-lg ring-1 ring-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-primary/30"
    >
      <div className="relative aspect-[1200/630] w-full shrink-0 self-stretch overflow-hidden rounded-xl sm:aspect-auto sm:w-2/5 sm:min-h-40">
        <Image
          title={blog.title}
          alt={blog.title}
          src={blog.image}
          fill
          sizes="(max-width: 640px) 100vw, 40vw"
          quality={50}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex min-w-0 flex-col w-full h-full px-2 pb-2 mt-2 sm:mt-0 sm:p-1 lg:py-5 md:pr-5">
        <Link
          href={`/blog/${blog.slug}`}
          className="font-bold text-foreground md:text-xl transition-colors hover:text-primary"
        >
          {blog.title}
        </Link>
        <p className="mt-3 text-sm sm:text-xs md:text-sm  text-muted-foreground line-clamp-3 sm:line-clamp-2 md:line-clamp-4 mb-2">
          {blog.excerpt}
        </p>

        <div className="flex items-center justify-between mt-auto">
          <div className="z-10 flex items-center gap-3 font-barlow">
            <div className="w-[30px]">
              <Image
                alt={authorName}
                height={933}
                width={933}
                src={authorPicture}
                className="rounded-full !m-0 h-full"
              />
            </div>
            <div className="flex flex-col">
              <Link href="/about" className="text-sm font-bold hover:underline">
                {authorName}
              </Link>
              <span className="text-xs">
                {getFormattedDate(new Date(blog.date))}
              </span>
            </div>
          </div>
          <p className="flex items-center justify-between text-xs font-medium text-muted-foreground md:text-sm">
            <span>{blog.readingTime.text}</span>
          </p>
        </div>
      </div>
    </motion.article>
  );
}
