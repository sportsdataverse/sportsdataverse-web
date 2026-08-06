"use client";

import { useEffect, useRef, useState } from "react";
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
  const mounted = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    // React 18+ StrictMode double-invokes effects in dev; Swagger UI would
    // otherwise mount twice into the same node.
    if (mounted.current) return;
    mounted.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const { default: SwaggerUIBundle } = await import(
          "swagger-ui-dist/swagger-ui-es-bundle.js"
        );
        if (cancelled) return;
        SwaggerUIBundle({
          url: "/api/platform/openapi",
          domNode: document.getElementById("swagger-ui"),
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
          onComplete: () => !cancelled && setStatus("ready"),
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
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
        .
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
