"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { flush, setLogin, track } from "@lib/platform/beacon";

export default function PlatformBeacon({ login }: { login: string | null }) {
  const pathname = usePathname();

  useEffect(() => setLogin(login), [login]);

  useEffect(() => {
    if (pathname) track("pageview", { path: pathname });
  }, [pathname]);

  useReportWebVitals((m) =>
    track("web_vital", { name: m.name, value: m.value })
  );

  useEffect(() => {
    const onErr = (e: ErrorEvent) =>
      track("js_error", { name: String(e.message).slice(0, 300) });
    const onRej = (e: PromiseRejectionEvent) =>
      track("js_error", { name: String(e.reason).slice(0, 300) });
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
      flush();
    };
  }, []);

  return null;
}
