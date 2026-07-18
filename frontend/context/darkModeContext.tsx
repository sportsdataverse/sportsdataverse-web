"use client";

/**
 * Legacy dark-mode API, bridged onto next-themes.
 *
 * The original context owned theme state itself (localStorage `isDarkMode` +
 * a `dark` class on <body>). Theming is now next-themes' job (class on <html>,
 * its own persistence), so this module keeps the old `useDarkMode()` /
 * `DarkModeProvider` surface alive for the remaining legacy components while
 * delegating all state to next-themes. Remove alongside the last consumers.
 */

import { useTheme } from "next-themes";

export interface DarkModeContextType {
  isDarkMode: boolean;
  changeDarkMode(value: boolean): void;
}

/** No-op passthrough — ThemeProvider (next-themes) is the real provider now. */
export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export const useDarkMode = (): DarkModeContextType => {
  const { resolvedTheme, setTheme } = useTheme();
  return {
    isDarkMode: resolvedTheme === "dark",
    changeDarkMode: (value: boolean) => setTheme(value ? "dark" : "light"),
  };
};
