import localFont from "next/font/local";

/* Self-host + optimize the brand fonts via next/font (preload, zero layout
   shift). Exposed as CSS variables consumed by the Tailwind theme
   (--font-sans/--font-display/--font-script in styles/globals.css). */

export const inter = localFont({
  src: "../public/fonts/Inter-var.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const barlow = localFont({
  src: [
    { path: "../public/fonts/Barlow/Barlow-400.woff2", weight: "400" },
    { path: "../public/fonts/Barlow/Barlow-500.woff2", weight: "500" },
    { path: "../public/fonts/Barlow/Barlow-600.woff2", weight: "600" },
    { path: "../public/fonts/Barlow/Barlow-700.woff2", weight: "700" },
    { path: "../public/fonts/Barlow/Barlow-800.woff2", weight: "800" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

export const sarina = localFont({
  src: "../public/fonts/Sarina/Sarina-400.woff2",
  variable: "--font-sarina",
  display: "swap",
  weight: "400",
});

/* Display face: condensed broadcast/jersey lettering for headlines, section
   headers, and scoreboard-style numerics. */
export const barlowCondensed = localFont({
  src: [
    { path: "../public/fonts/BarlowCondensed/BarlowCondensed-600.woff2", weight: "600" },
    { path: "../public/fonts/BarlowCondensed/BarlowCondensed-700.woff2", weight: "700" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
});
