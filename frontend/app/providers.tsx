"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import PlausibleProvider from "next-plausible";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "@components/ui/sonner";
import { TooltipProvider } from "@components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlausibleProvider domain="sportsdataverse.org">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <TooltipProvider delayDuration={200}>
            <NextTopLoader color="var(--primary)" showSpinner={false} height={3} />
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </PlausibleProvider>
    </SessionProvider>
  );
}
