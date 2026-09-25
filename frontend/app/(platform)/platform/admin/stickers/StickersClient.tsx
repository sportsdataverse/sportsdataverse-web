"use client";

import { useState } from "react";
import { Button } from "@components/ui/button";
import { useAdmin } from "../AdminOverviewClient";

type Address = {
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postal?: string | null;
  country: string;
};

type StickerRow = {
  id: string;
  name: string;
  address: Address | null;
  createdAt: string;
};

type ActionResult = { success: boolean; message: string };

export default function StickersClient() {
  const { data, error, mutate } = useAdmin<{ shipped: number; requests: StickerRow[] }>("stickers");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function act(id: string, name: string, action: "ship" | "cancel") {
    const question =
      action === "ship"
        ? `Mark the stickers for ${name} as shipped? Their address will be deleted.`
        : `Cancel the sticker request for ${name}? Their address will be deleted.`;
    if (!confirm(question)) return;

    setBusy(`${id}:${action}`);
    try {
      const res = await fetch(`/api/platform/admin/stickers/${id}/${action}`, { method: "POST" });
      let data: ActionResult | null = null;
      try {
        data = (await res.json()) as ActionResult;
      } catch {
        data = null;
      }
      // a non-OK or non-JSON response is always a failure — never show a stale success
      if (!res.ok || !data || typeof data.success !== "boolean") {
        setResult({ success: false, message: data?.message ?? "Couldn't update that request — try again." });
      } else {
        setResult(data);
      }
      await mutate();
    } catch {
      setResult({ success: false, message: "Couldn't update that request — try again." });
    } finally {
      setBusy(null);
    }
  }

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Stickers</h1>
      </div>

      {data ? <p className="text-sm text-muted-foreground">{data.shipped} shipped so far.</p> : null}

      {/* Mounted unconditionally so the live region already exists in the accessibility
          tree before the first action — a role="status" node that appears and gets its
          text in the same commit is generally not announced by screen readers. */}
      <div
        role="status"
        className={
          result
            ? `rounded-lg border p-3 text-sm ${
                result.success ? "border-border bg-card" : "border-destructive/60 bg-destructive/10 text-destructive"
              }`
            : "sr-only"
        }
      >
        {result ? result.message : null}
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load sticker requests.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open sticker requests.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
              <div className="font-inter text-sm">
                <p className="font-semibold">{r.name}</p>
                {r.address ? (
                  <address className="not-italic text-muted-foreground">
                    <div>{r.address.line1}</div>
                    {r.address.line2 ? <div>{r.address.line2}</div> : null}
                    <div>{[r.address.city, r.address.region, r.address.postal].filter(Boolean).join(", ")}</div>
                    <div>{r.address.country}</div>
                  </address>
                ) : (
                  <p className="text-muted-foreground">No address on file.</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" disabled={busy !== null} onClick={() => act(r.id, r.name, "ship")}>
                  {busy === `${r.id}:ship` ? "Marking…" : "Mark shipped"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => act(r.id, r.name, "cancel")}
                >
                  {busy === `${r.id}:cancel` ? "Cancelling…" : "Cancel"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
