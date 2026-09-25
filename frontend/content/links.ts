// Zero imports on purpose: lib/email.ts (loaded by `node --test`, which cannot
// resolve react-icons or the non-type `@lib/types` import in content/support.ts)
// needs these values too. content/support.ts and components/site/FollowUs.tsx
// both import from here now instead of defining their own copies.

// Follow links — mirror the org profile README (github.com/sportsdataverse/.github
// → profile/README.md). Moved unchanged from components/site/FollowUs.tsx.
export const FOLLOW_LINKS = [
  { platform: "github", label: "GitHub — sportsdataverse", href: "https://github.com/sportsdataverse" },
  { platform: "bluesky", label: "Bluesky — @sportsdataverse.org", href: "https://bsky.app/profile/sportsdataverse.org" },
  { platform: "twitter", label: "Twitter / X — @SportsDataverse", href: "https://twitter.com/sportsdataverse" },
];

// Canonical support links — mirror the org profile README
// (github.com/sportsdataverse/.github → profile/README.md). Moved unchanged
// from content/support.ts.
export const KOFI_URL = "https://ko-fi.com/G2G0KJ588";
export const PAYPAL_URL = "https://www.paypal.me/SaiemGilani";
export const DO_REFERRAL_URL =
  "https://www.digitalocean.com/?refcode=38816e14651f&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge";

// The one address every "write to us" instruction points at — the same one the
// privacy page already publishes. Keep every "reply"/"write in" sentence on this
// constant instead of a hardcoded copy, so changing the address is one edit.
export const CONTACT_EMAIL = "sportsdataverse@gmail.com";
