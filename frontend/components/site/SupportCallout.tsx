import supportOptions from "@content/support";

/**
 * Support strip — Ko-fi, DigitalOcean referral, PayPal. Server component;
 * used on About and Resources. Links come from content/support.ts (which
 * mirrors the org profile README).
 */
export default function SupportCallout() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
      <p className="eyebrow">Support</p>
      <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight">
        Keep the data free
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Everything here is free to use — and costs real money to keep fresh.
        Donations pay for the servers that scrape, process, and serve the data
        every night. Signing up for DigitalOcean through our referral link
        gives your new account free credit and sends a slice back to the
        project at no cost to you.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {supportOptions.map(({ name, url, Icon }, i) => (
          <a
            key={name}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={
              i === 0
                ? "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                : "inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary"
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {name}
          </a>
        ))}
      </div>
    </div>
  );
}
