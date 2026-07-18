import "@styles/globals.css";
import type { Metadata } from "next";
import { inter, barlow, sarina, barlowCondensed } from "@lib/fonts";
import { baseMetadata } from "@lib/metadata";
import { Providers } from "./providers";

export const metadata: Metadata = baseMetadata;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${barlow.variable} ${sarina.variable} ${barlowCondensed.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
