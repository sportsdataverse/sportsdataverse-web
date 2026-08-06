"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import "swagger-ui-dist/swagger-ui.css";
import "./swagger-theme.css";

/**
 * Swagger UI over the member-gated spec proxy.
 *
 * The bundle is imported dynamically so ~1 MB of vendor JS is code-split to this
 * route and never runs during SSR (it touches `window` at module scope). The
 * spec's `servers` entry points at the Data API, so "try it out" calls it
 * directly — the reader supplies their own key via Authorize.
 */
export default function ApiDocsClient() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        // Fetch the spec ourselves rather than handing Swagger UI a URL: its
        // onComplete only fires once a spec parses, so a 502 from the proxy
        // would otherwise leave this page spinning with no way to report it.
        const [{ default: SwaggerUIBundle }, resp] = await Promise.all([
          import("swagger-ui-dist/swagger-ui-es-bundle.js"),
          fetch("/api/platform/openapi", { signal: controller.signal }),
        ]);
        if (!resp.ok) throw new Error(`spec request failed: ${resp.status}`);
        const spec = await resp.json();
        if (controller.signal.aborted) return;

        const node = document.getElementById("swagger-ui");
        if (!node) return;
        // StrictMode re-runs this effect in dev; start from a clean node so the
        // second pass replaces the first render instead of appending to it.
        node.replaceChildren();

        SwaggerUIBundle({
          spec,
          domNode: node,
          presets: [SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
          docExpansion: "none",
          filter: true,
          persistAuthorization: true,
          tryItOutEnabled: true,
          defaultModelsExpandDepth: -1,
          // 338 endpoints, some with 300+ column schemas — deep-expanding models
          // by default makes the page unusable.
          defaultModelExpandDepth: 1,
        });
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <KeyRound className="size-4 shrink-0" />
        To run a request, click <span className="font-medium text-foreground">Authorize</span> and
        paste a key from
        <Link href="/platform/api-key" className="font-medium text-primary hover:underline">
          your API key page
        </Link>
        — it stays in this browser until you clear it.
      </p>

      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading the reference (the spec is ~6 MB)…</p>
      ) : null}
      {status === "error" ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-display text-sm font-bold uppercase tracking-wide">
            Couldn’t load the reference
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The Data API may be unreachable, or this deployment is missing its API key. The
            committed spec is always available in the{" "}
            <a
              href="https://github.com/sportsdataverse/sdv-db/blob/main/docs/sdv-data-api.openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              sdv-db repo
            </a>
            .
          </p>
        </div>
      ) : null}

      <div id="swagger-ui" />
    </div>
  );
}
