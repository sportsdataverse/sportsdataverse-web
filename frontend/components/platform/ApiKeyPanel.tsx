"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import fetcher from "@lib/fetcher";
import { StatusBadge, timeAgo } from "@components/platform/widgets";
import KeyRevealCard, { type MintedKey } from "@components/platform/KeyRevealCard";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@components/ui/dialog";
import { Skeleton } from "@components/ui/skeleton";

interface KeyMeta {
  key_id: string;
  owner: string;
  scopes: string[];
  disabled: boolean;
  created_at: string;
  issued_by?: string | null;
}

export default function ApiKeyPanel() {
  const { data, isLoading, mutate } = useSWR<{ owner: string; keys: KeyMeta[] }>(
    "/api/platform/keys",
    fetcher,
    { revalidateOnFocus: false }
  );
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);

  const activeKey = data?.keys?.find((k) => !k.disabled) ?? null;

  async function call(path: string, failLabel: string) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
      }
      setMinted(body as MintedKey);
      mutate();
    } catch (err) {
      toast.error(failLabel, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
      setRotateOpen(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {minted ? <KeyRevealCard minted={minted} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <KeyRound className="size-4 text-primary" />
            Data API key
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            A personal read-scoped key for{" "}
            <code className="font-mono text-xs">data.sportsdataverse.org</code>{" "}
            (all <code className="font-mono text-xs">/v1</code> read endpoints).
            Send it as{" "}
            <code className="font-mono text-xs">Authorization: Bearer &lt;key&gt;</code>.
          </p>

          {activeKey ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm font-semibold">
                    {activeKey.key_id}…
                  </code>
                  <StatusBadge status="ok" />
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  scopes {activeKey.scopes.join(",")} · issued{" "}
                  {timeAgo(activeKey.created_at)}
                  {activeKey.issued_by
                    ? ` · by ${activeKey.issued_by.replace(/^gh:/, "@")}`
                    : ""}
                </p>
                {activeKey.issued_by ? (
                  <p className="text-xs text-muted-foreground">
                    An org owner issued this key for you. Rotating it is yours to
                    do — the new secret is shown only to you.
                  </p>
                ) : null}
                {!minted ? (
                  <p className="text-xs text-muted-foreground">
                    The full key was shown when it was issued and can&apos;t be
                    displayed again. Lost it? Rotate to get a new one.
                  </p>
                ) : null}
              </div>
              <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" disabled={busy}>
                    <RefreshCw className="size-3.5" /> Rotate key
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rotate your API key?</DialogTitle>
                    <DialogDescription>
                      Your current key ({activeKey.key_id}…) stops working
                      immediately. Anything using it — scripts, notebooks, CI —
                      will need the new key.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setRotateOpen(false)}>
                      Keep current key
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      disabled={busy}
                      onClick={() => call("/api/platform/keys/rotate", "Rotate failed")}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      Rotate now
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
              <p className="text-sm text-muted-foreground">
                No API key yet — issue one to query the Data API directly.
              </p>
              <Button
                size="sm"
                className="gap-2"
                disabled={busy}
                onClick={() => call("/api/platform/keys", "Issue failed")}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Issue API key
              </Button>
            </div>
          )}

          {data?.keys?.some((k) => k.disabled) ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-mono">revoked keys</summary>
              <ul className="mt-2 space-y-1">
                {data.keys
                  .filter((k) => k.disabled)
                  .map((k) => (
                    <li key={k.key_id} className="font-mono">
                      {k.key_id}… · issued {timeAgo(k.created_at)} · revoked
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
