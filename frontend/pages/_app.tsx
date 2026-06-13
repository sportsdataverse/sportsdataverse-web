import "@styles/globals.css";
import Layout from "@layout/Layout";
import { useEffect } from "react";
import { useRouter } from "next/router";
import NProgress from "nprogress";
import "nprogress/nprogress.css";
import { DarkModeProvider } from "@context/darkModeContext";
import { GoogleAnalytics } from "nextjs-google-analytics";
import PlausibleProvider from 'next-plausible'
import { SessionProvider } from "next-auth/react";
import { AppProps } from "next/app";
import localFont from "next/font/local";

// Self-host + optimize the brand fonts via next/font (preload, zero layout
// shift). Exposed as CSS variables consumed by tailwind's fontFamily.
const inter = localFont({
  src: "../public/fonts/Inter-var.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});
const barlow = localFont({
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
const sarina = localFont({
  src: "../public/fonts/Sarina/Sarina-400.woff2",
  variable: "--font-sarina",
  display: "swap",
  weight: "400",
});

NProgress.configure({
  easing: "ease",
  speed: 800,
  showSpinner: false,
});

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const start = () => {
      NProgress.start();
    };
    const end = () => {
      NProgress.done();
    };
    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", end);
    router.events.on("routeChangeError", end);
    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", end);
      router.events.off("routeChangeError", end);
    };
  }, [router.events]);

  return (
    <SessionProvider session={session}>
      <PlausibleProvider domain="sportsdataverse.org">
        <DarkModeProvider>
          <div className={`${inter.variable} ${barlow.variable} ${sarina.variable} font-inter`}>
            <Layout>
              {process.env.NODE_ENV === "production" && (
                <GoogleAnalytics strategy="lazyOnload" />
              )}
              <Component {...pageProps} />
            </Layout>
          </div>
        </DarkModeProvider>
      </PlausibleProvider>
    </SessionProvider>
  );
}

export default MyApp;
