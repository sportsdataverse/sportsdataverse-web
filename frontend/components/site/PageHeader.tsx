import { PROSE_MEASURE } from "@lib/prose";

/**
 * The one page-title pattern for the public site (DESIGN.md "Components"): condensed display caps with
 * the amber score-underline (the page's single amber moment) and an optional lede. Every public route
 * renders its only <h1> here, except the home hero. `compact` is the smaller size for a blog post or a
 * snippet, whose title sits above the article's own byline. Server-safe; `not-prose` keeps the
 * typography plugin's h1 and p styles off it when a layout renders it inside `.prose`.
 */
export default function PageHeader({
  title,
  compact = false,
  children,
}: {
  title: string;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div data-page-header className={compact ? "not-prose pt-2" : "not-prose pt-12 md:pt-16"}>
      <h1
        className={
          compact
            ? "font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight md:text-4xl"
            : "mt-2 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl"
        }
      >
        <span className="relative inline-block">
          {title}
          <span aria-hidden className="absolute -bottom-1 left-0 h-1 w-full bg-score" />
        </span>
      </h1>
      {children ? (
        <div className={PROSE_MEASURE}>
          <p
            className={
              compact
                ? "mt-4 text-base leading-relaxed text-muted-foreground"
                : "mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg"
            }
          >
            {children}
          </p>
        </div>
      ) : null}
    </div>
  );
}
