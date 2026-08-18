"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { KeyRound, Loader2, RefreshCw, UserPlus, XCircle } from "lucide-react";
import fetcher from "@lib/fetcher";
import { timeAgo } from "@components/platform/widgets";
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
} from "@components/ui/dialog";
import { Input } from "@components/ui/input";

interface KeyMeta {
  key_id: string;
  owner: string;
  scopes: string[];
  disabled: boolean;
  created_at: string;
  issued_by?: string | null;
  disabled_by?: string | null;
  disabled_at?: string | null;
}

/** Mirrors the server's `normalizeLogin` so the form can pre-empt a 422. */
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

function cleanLogin(input: string): string {
  return input.trim().replace(/^@/, "").replace(/^gh:/i, "").trim();
}

function atLogin(owner: string | null | undefined): string {
  return owner ? owner.replace(/^gh:/, "@") : "";
}

/** The destructive actions get a confirm step; they hit someone else's access. */
type Pending =
  | { kind: "rotate"; key: null }
  | { kind: "revoke"; key: KeyMeta }
  | null;

/**
 * Org-owner key management for *other* people: issue, rotate, revoke.
 *
 * The recipient need not be an org member — this is how outside collaborators
 * get Data API access. Owners can't act on themselves here (the route and the
 * Data API both refuse it); their own key lives on /platform/api-key.
 */
export default function DelegatedKeysCard() {
  const [input, setInput] = useState("");
  const [lookup, setLookup] = useState("");
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

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

  async function call(
    path: string,
    payload: Record<string, unknown>,
    { reveal, ok, fail }: { reveal: boolean; ok: string; fail: string }
  ) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
      }
      if (reveal) setMinted(body as MintedKey);
      mutate();
      toast.success(ok);
    } catch (err) {
      toast.error(fail, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const issue = () =>
    call(
      "/api/platform/keys/for",
      {},
      { reveal: true, ok: `Issued a read key for ${login}`, fail: "Issue failed" }
    );

  const rotate = () =>
    call(
      "/api/platform/keys/for/rotate",
      {},
      { reveal: true, ok: `Rotated ${login}'s key`, fail: "Rotate failed" }
    );

  const revoke = (key: KeyMeta) =>
    call(
      "/api/platform/keys/for/revoke",
      { key_id: key.key_id },
      { reveal: false, ok: `Revoked ${key.key_id}…`, fail: "Revoke failed" }
    );

  const status = () => {
    if (input && !valid)
      return "not a GitHub login (letters, digits, single hyphens, ≤39 chars)";
    if (blocked) return existing?.message ?? "";
    if (looking) return "checking…";
    if (!lookup) return " ";
    return active.length
      ? `${login} holds ${active.length} active key`
      : `${login} holds no active key`;
  };

  return (
    <div className="flex flex-col gap-4">
      {minted ? (
        <KeyRevealCard minted={minted} recipient={atLogin(minted.owner)} />
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <UserPlus className="size-4 text-primary" />
            Keys for other people
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Org owners can issue, rotate and revoke a read-scoped{" "}
            <code className="font-mono text-xs">data.sportsdataverse.org</code>{" "}
            key for another GitHub account — they don&apos;t need to be in the
            org. The key belongs to them: it shows on their own API key page
            stamped with who issued it. For your own key, use{" "}
            <code className="font-mono text-xs">/platform/api-key</code>.
          </p>

          <div className="flex flex-wrap items-start gap-2">
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && valid && !busy && !active.length) issue();
                }}
                placeholder="github-login"
                aria-label="GitHub login to manage keys for"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="min-h-4 font-mono text-xs text-muted-foreground">
                {status()}
              </p>
            </div>
            {active.length ? (
              <Button
                variant="outline"
                className="gap-2"
                disabled={!valid || busy}
                onClick={() => setPending({ kind: "rotate", key: null })}
              >
                <RefreshCw className="size-4" /> Rotate their key
              </Button>
            ) : (
              <Button
                className="gap-2"
                disabled={!valid || busy || blocked || Boolean(looking && lookup)}
                onClick={issue}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Issue read key
              </Button>
            )}
          </div>

          {existing?.keys?.length ? (
            <div className="rounded-lg border border-border/60 p-3">
              <p className="mb-2 font-mono text-xs text-muted-foreground">
                keys for {login}
              </p>
              <ul className="space-y-1 font-mono text-xs">
                {existing.keys.map((k) => (
                  <li
                    key={k.key_id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
                  >
                    <span className="text-foreground">{k.key_id}…</span>
                    <span>
                      · {k.scopes.join(",")} · issued {timeAgo(k.created_at)}
                      {k.issued_by ? ` by ${atLogin(k.issued_by)}` : " (self)"}
                    </span>
                    {k.disabled ? (
                      <span>
                        · revoked
                        {k.disabled_at ? ` ${timeAgo(k.disabled_at)}` : ""}
                        {k.disabled_by ? ` by ${atLogin(k.disabled_by)}` : ""}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => setPending({ kind: "revoke", key: k })}
                      >
                        <XCircle className="size-3.5" /> revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "revoke"
                ? `Revoke ${login}'s key?`
                : `Rotate ${login}'s key?`}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "revoke" ? (
                <>
                  {pending.key.key_id}… stops working immediately and nothing
                  replaces it — anything {login} runs against the Data API breaks
                  until they issue a new key from their own API key page.
                </>
              ) : (
                <>
                  {login}&apos;s current key stops working immediately. The
                  replacement is shown to <em>you</em>, once — you&apos;ll need to
                  get it to them privately. If they can sign in, having them
                  rotate it themselves is the safer path.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={busy}
              onClick={() =>
                pending?.kind === "revoke" ? revoke(pending.key) : rotate()
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending?.kind === "revoke" ? "Revoke now" : "Rotate now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
