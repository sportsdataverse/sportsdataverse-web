import TrackedLink from "@components/site/TrackedLink";

const LINKS = [
  { platform: "github", label: "GitHub — sportsdataverse", href: "https://github.com/sportsdataverse" },
  { platform: "bluesky", label: "Bluesky — @sportsdataverse.org", href: "https://bsky.app/profile/sportsdataverse.org" },
  { platform: "twitter", label: "Twitter / X — @SportsDataverse", href: "https://twitter.com/sportsdataverse" },
];

/** Follow links with follow_click tracking; used on thank-you views. */
export default function FollowUs({ placement }: { placement: string }) {
  return (
    <div>
      <p className="eyebrow">Follow along</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {LINKS.map((l) => (
          <li key={l.platform}>
            <TrackedLink
              href={l.href}
              event="follow_click"
              platform={l.platform}
              placement={placement}
              className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary"
            >
              {l.label}
            </TrackedLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
