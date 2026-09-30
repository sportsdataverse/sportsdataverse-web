import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ogCard } from "@lib/ogSummary";

// Dark-theme tokens (styles/globals.css): background, foreground, muted-foreground, score.
const BG = "#0b1220";
const FG = "#e9eef6";
const MUTED = "#93a1b8";
const SCORE = "#ffb43c";

// Satori reads WOFF, not WOFF2: a WOFF copy of the display face sits beside the site's.
const font = readFile(join(process.cwd(), "public/fonts/BarlowCondensed/BarlowCondensed-700.woff"));

/** A platform view's share card. Public by construction: it reads no data and no
 *  session, and renders only a known view's name and `ogSummary`'s sanitized text. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { title, summary } = ogCard(sp.get("view") ?? "", sp);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: BG,
          color: FG,
          fontFamily: "Barlow Condensed",
        }}
      >
        <div style={{ fontSize: 40, color: MUTED }}>SportsDataverse platform</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 128, lineHeight: 1, textTransform: "uppercase" }}>{title}</div>
          <div style={{ width: 128, height: 8, marginTop: 28, background: SCORE }} />
          {summary ? <div style={{ fontSize: 48, marginTop: 32 }}>{summary}</div> : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Barlow Condensed", data: await font, weight: 700, style: "normal" }],
      // The card is a pure function of its URL: let browsers keep it a day and the CDN a week.
      headers: { "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400" },
    }
  );
}
