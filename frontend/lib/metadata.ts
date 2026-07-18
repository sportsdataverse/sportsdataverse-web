import type { Metadata } from "next";

const SITE = "https://www.sportsdataverse.org";
const COVER =
  "https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-web/main/frontend/public/logo/cover.png";

/** Site-wide defaults for the App Router Metadata API; pages override via
 *  their own `metadata` / `generateMetadata` exports. */
export const baseMetadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "SportsDataverse",
    template: "%s · SportsDataverse",
  },
  description:
    "Welcome to the SportsDataverse. We are an open-source sports data organization trying to make data and utilities more accessible for everyday users.",
  openGraph: {
    siteName: "SportsDataverse",
    type: "website",
    url: SITE,
    images: [{ url: COVER }],
  },
  twitter: {
    card: "summary_large_image",
    images: [COVER],
  },
};
