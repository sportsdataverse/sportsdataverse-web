import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export type PostNavLink = { slug: string; title: string } | null;

/**
 * Tail navigation between adjacent blog posts. `prev` is the chronologically
 * older post, `next` is the newer one. Renders nothing if a post has neither
 * (a single-post site) and keeps each card in its lane when only one exists.
 */
export default function PostNavigation({
  prev,
  next,
}: {
  prev: PostNavLink;
  next: PostNavLink;
}) {
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Post navigation"
      className="not-prose my-12 grid grid-cols-1 gap-4 sm:grid-cols-2 print:hidden"
    >
      {prev ? (
        <Link
          href={`/blog/${prev.slug}`}
          className="group flex flex-col gap-1 rounded-xl border border-gray-200 bg-white/70 p-4 no-underline transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-gray-700 dark:bg-darkSecondary/70"
        >
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" />
            Previous
          </span>
          <span className="font-barlow font-semibold leading-snug text-gray-900 transition-colors group-hover:text-primary dark:text-gray-100 dark:group-hover:text-sky-300">
            {prev.title}
          </span>
        </Link>
      ) : (
        // keep `next` in the right lane on >= sm when there's no previous post
        <span className="hidden sm:block" aria-hidden="true" />
      )}

      {next ? (
        <Link
          href={`/blog/${next.slug}`}
          className="group flex flex-col items-end gap-1 rounded-xl border border-gray-200 bg-white/70 p-4 text-right no-underline transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-gray-700 dark:bg-darkSecondary/70"
        >
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Next
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
          <span className="font-barlow font-semibold leading-snug text-gray-900 transition-colors group-hover:text-primary dark:text-gray-100 dark:group-hover:text-sky-300">
            {next.title}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
