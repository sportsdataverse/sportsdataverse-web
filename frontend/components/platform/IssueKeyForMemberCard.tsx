"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import fetcher from "@lib/fetcher";
import { timeAgo } from "@components/platform/widgets";
import KeyRevealCard, { type MintedKey } from "@components/platform/KeyRevealCard";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import { Input } from "@components/ui/input";

interface KeyMeta {
  key_id: string;
  owner: string;
  scopes: string[];
  disabled: boolean;
  created_at: string;
  issued_by?: string | null;
}

/** Mirrors the server's `normalizeLogin` so the form can pre-empt a 422. */
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

function cleanLogin(input: string): string {
  return input.trim().replace(/^@/, "").replace(/^gh:/i, "").trim();
}

/**
 * Org-owner issuance: mint a Data API key for somebody else.
 *
 * The recipient need not be an org member — this is how outside collaborators
 * get Data API access. Owners can't issue to themselves here (the server
 * refuses it too); their own key lives on /platform/api-key.
 */
export default function IssueKeyForMemberCard() {
  const [input, setInput] = useState("");
  const [lookup, setLookup] = useState("");
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [busy, setBusy] = useState(false);

  const login = cleanLogin(input);
  const valid = LOGIN_RE.test(login);

  // Debounced peek at what they already hold, so "they've got one" shows up
  // before the mint round-trips a 409 instead of after.
  useEffect(() => {
    const t = setTimeout(() => setLookup(valid ? login : ""), 400);
    return () => clearTimeout(t);
  }, [login, valid]);

  const { data: existing, isLoading: looking, mutate } = useSWR<{
    owner: string;
    keys: KeyMeta[];
    message?: string;
  }>(lookup ? `/api/platform/keys/for?login=${encodeURIComponent(lookup)}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const active = existing?.keys?.filter((k) => !k.disabled) ?? [];
  const blocked = Boolean(existing?.message);

  async function issue() {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/keys/for", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
      }
      setMinted(body as MintedKey);
      setInput("");
      mutate();
      toast.success(`Issued a read key for ${login}`);
    } catch (err) {
      toast.error("Issue failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {minted ? (
        <KeyRevealCard
          minted={minted}
          recipient={minted.owner.replace(/^gh:/, "@")}
        />
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <UserPlus className="size-4 text-primary" />
            Issue a key for someone else
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Org owners can mint a read-scoped{" "}
            <code className="font-mono text-xs">data.sportsdataverse.org</code>{" "}
            key on another GitHub account&apos;s behalf — they don&apos;t need to
            be in the org. The key belongs to them: it shows up on their own API
            key page, stamped with your login, and they rotate it themselves. For
            your own key, use{" "}
            <code className="font-mono text-xs">/platform/api-key</code>.
          </p>

          <div className="flex flex-wrap items-start gap-2">
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && valid && !busy) issue();
                }}
                placeholder="github-login"
                aria-label="GitHub login to issue a key for"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="min-h-4 font-mono text-xs text-muted-foreground">
                {input && !valid
                  ? "not a GitHub login (letters, digits, single hyphens, ≤39 chars)"
                  : blocked
                    ? existing?.message
                    : looking
                      ? "checking…"
                      : active.length
                        ? `${login} already holds ${active.length} active key (${active
                            .map((k) => `${k.key_id}…`)
                            .join(", ")}) — they can rotate it themselves`
                        : lookup
                          ? `${login} holds no active key`
                          : " "}
              </p>
            </div>
            <Button
              className="gap-2"
              disabled={!valid || busy || blocked || active.length > 0}
              onClick={issue}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Issue read key
            </Button>
          </div>

          {existing?.keys?.length ? (
            <div className="rounded-lg border border-border/60 p-3">
              <p className="mb-2 font-mono text-xs text-muted-foreground">
                keys for {login}
              </p>
              <ul className="space-y-1 font-mono text-xs">
                {existing.keys.map((k) => (
                  <li key={k.key_id} className="text-muted-foreground">
                    <span className="text-foreground">{k.key_id}…</span> ·{" "}
                    {k.scopes.join(",")} · issued {timeAgo(k.created_at)}
                    {k.issued_by ? ` by ${k.issued_by.replace(/^gh:/, "@")}` : " (self)"}
                    {k.disabled ? " · revoked" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
