"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";

/** A freshly minted key, as returned by the Data API's mint/rotate routes. */
export interface MintedKey {
  key_id: string;
  owner: string;
  scopes: string[];
  token: string;
  revoked: number;
  issued_by?: string | null;
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-2 font-mono text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success("Key copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "copied" : "copy"}
    </Button>
  );
}

/**
 * The show-once reveal. Only a hash of the token reaches the database, so this
 * render is the single moment the plaintext exists outside the minting
 * response — the copy leans on that hard in both modes.
 *
 * `recipient` (a bare GitHub login) switches it from "your key" to "their key",
 * which is the delegated-issuance case: an org owner is now holding a secret
 * that belongs to someone else and has to get it to them safely.
 */
export default function KeyRevealCard({
  minted,
  recipient,
}: {
  minted: MintedKey;
  recipient?: string;
}) {
  return (
    <Card className="border-status-running/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <TriangleAlert className="size-4 text-status-running" />
          {recipient ? `New API key for ${recipient}` : "Your new API key"} — shown once
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {recipient ? (
            <>
              Send it to {recipient} over a private channel and don&apos;t keep a
              copy. Only a hash is kept server-side, so this exact value can
              never be displayed again — if it&apos;s lost, they can rotate it
              themselves from their API key page.
            </>
          ) : (
            <>
              Copy it now and store it somewhere safe. Only a hash is kept
              server-side, so this exact value can never be displayed again — if
              it&apos;s lost, rotate to get a new one.
            </>
          )}
          {minted.revoked > 0
            ? ` (${minted.revoked} previous key${minted.revoked > 1 ? "s" : ""} just stopped working.)`
            : ""}
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm">
            {minted.token}
          </code>
          <CopyButton value={minted.token} />
        </div>
        <div>
          <p className="mb-1 font-mono text-xs text-muted-foreground">usage</p>
          <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-xs leading-5">
            {`curl -H "Authorization: Bearer ${minted.token.slice(0, 8)}…" \\\n  https://data.sportsdataverse.org/v1/schemas`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
