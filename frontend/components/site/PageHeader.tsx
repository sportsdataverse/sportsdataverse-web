/**
 * The one page-title pattern for the public site: condensed display caps with
 * the amber score-underline (the page's single amber moment), optional kicker,
 * optional lede. Server-safe; renders the page's only <h1>.
 */
export default function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="pt-12 md:pt-16">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl">
        <span className="relative inline-block">
          {title}
          <span aria-hidden className="absolute -bottom-1 left-0 h-1 w-full bg-score" />
        </span>
      </h1>
      {children ? (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {children}
        </p>
      ) : null}
    </div>
  );
}
