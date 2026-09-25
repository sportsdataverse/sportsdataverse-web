"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/table";
import PopulationPanel from "./PopulationPanel";

type View = "queue" | "unsynced" | "all" | "population";
type Action = "approve" | "decline" | "requeue" | "resend" | "retry-sync" | "delete";

type PersonRow = {
  id: string;
  email: string | null;
  name: string | null;
  githubLogin: string | null;
  claimedGithubLogin: string | null;
  status: "pending" | "approved" | "declined" | "auto" | "survey";
  wantsDiscord: boolean;
  wantsNewsletter: boolean;
  newsletterState: "synced" | "pending" | "skipped" | "none";
  hasInvite: boolean;
  createdAt: string;
  reviewedBy: string | null;
  declineReason: string | null;
};

type ActionResult = { success: boolean; message: string; inviteUrl?: string };

const VIEWS: { value: View; label: string }[] = [
  { value: "queue", label: "Queue" },
  { value: "unsynced", label: "Unsynced newsletter" },
  { value: "all", label: "All" },
  { value: "population", label: "Population" },
];

const STATUS_VARIANT: Record<PersonRow["status"], "default" | "outline" | "destructive" | "secondary"> = {
  pending: "outline",
  approved: "default",
  auto: "default",
  declined: "destructive",
  survey: "secondary",
};

export default function PeopleClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [view, setView] = useState<View>("queue");
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(false);

  function openDecline(id: string) {
    setDeclineFor((cur) => (cur === id ? null : id));
    setReason("");
    setNotify(false);
  }

  const load = useCallback(async (v: View) => {
    // Population renders its own panel and fetches its own endpoint — never
    // fetch the people list for it.
    if (v === "population") return;
    setLoadError(false);
    try {
      const res = await fetch(`/api/platform/people?view=${v}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { people: PersonRow[]; total: number };
      setPeople(data.people);
      setTotal(data.total);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    setPeople(null);
    setTotal(null);
    setResult(null);
    void load(view);
  }, [view, load]);

  async function act(id: string, action: Action, body?: { reason?: string; notify?: boolean }) {
    setBusy(`${id}:${action}`);
    try {
      const res = await fetch(`/api/platform/people/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await res.json()) as ActionResult;
      setResult(data);
      if (action === "decline") {
        setDeclineFor(null);
        setReason("");
        setNotify(false);
      }
      await load(view);
    } catch {
      setResult({ success: false, message: "Request failed." });
    } finally {
      setBusy(null);
    }
  }

  function copyInvite(url: string) {
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">People</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Button
            key={v.value}
            type="button"
            variant={view === v.value ? "default" : "outline"}
            size="sm"
            // the variant's colour is not enough on its own to say which view is showing
            aria-pressed={view === v.value}
            onClick={() => setView(v.value)}
          >
            {v.label}
          </Button>
        ))}
      </div>

      {/* Mounted unconditionally so the live region already exists in the accessibility
          tree before the first action — a role="status" node that appears and gets its
          text in the same commit is generally not announced by screen readers. */}
      <div
        role="status"
        className={
          result
            ? `space-y-2 rounded-lg border p-3 text-sm ${
                result.success ? "border-border bg-card" : "border-destructive/60 bg-destructive/10 text-destructive"
              }`
            : "sr-only"
        }
      >
        {result ? (
          <>
            <p>{result.message}</p>
            {result.inviteUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={result.inviteUrl} onFocus={(e) => e.currentTarget.select()} className="max-w-md" />
                <Button type="button" variant="outline" size="sm" onClick={() => copyInvite(result.inviteUrl!)}>
                  Copy
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {view === "population" ? (
        <PopulationPanel />
      ) : loadError ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load people.</p>
      ) : !people ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one here.</p>
      ) : (
        <div className="space-y-2">
          {total !== null && total > people.length ? (
            <p className="text-xs text-muted-foreground">
              Showing {people.length} of {total} — narrow the view or ask for pagination to see the rest.
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Wants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Newsletter</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => {
                // resendInvite mints against the CURRENT answer, so it refuses a row whose
                // latest /join said no Discord — don't offer a button that can only error
                const canResend = p.wantsDiscord && (p.hasInvite || p.status === "approved" || p.status === "auto");
                const canRetrySync = p.wantsNewsletter && p.newsletterState !== "synced";
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name ?? p.email ?? p.id}</div>
                      {p.email ? <div className="text-xs text-muted-foreground">{p.email}</div> : null}
                      {p.githubLogin ? (
                        <div className="text-xs text-muted-foreground">@{p.githubLogin}</div>
                      ) : null}
                      {/* A claim is shown whenever it is not the verified handle — including
                          ALONGSIDE one. A row can hold both: an admit whose invite failed keeps
                          the handle it bound and returns to the queue, and a later signed-in
                          submission on that address records a different claim. Hiding the
                          second is hiding exactly what the reviewer needs to notice. */}
                      {p.claimedGithubLogin && p.claimedGithubLogin !== p.githubLogin ? (
                        <div className="text-xs text-muted-foreground">
                          @{p.claimedGithubLogin}{" "}
                          <span className="rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide">
                            {p.githubLogin ? "unverified claim" : "unverified"}
                          </span>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.wantsDiscord ? <Badge variant="outline">Discord</Badge> : null}
                        {p.wantsNewsletter ? <Badge variant="outline">Newsletter</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                      {p.declineReason ? <div className="mt-1 text-xs text-muted-foreground">{p.declineReason}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.newsletterState}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Approve and Decline are both Discord decisions, and every
                            newsletter or survey row is stamped "pending" too — offering
                            either on a row that never asked for Discord decides nothing
                            and used to be a one-way trip. lib/review.ts refuses both. */}
                        {p.status === "pending" && p.wantsDiscord ? (
                          <>
                            <Button type="button" size="sm" disabled={busy === `${p.id}:approve`} onClick={() => act(p.id, "approve")}>
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openDecline(p.id)}
                            >
                              Decline
                            </Button>
                          </>
                        ) : null}
                        {/* the only way back out of `declined`: no queue lists them and
                            /join will not re-open them, so without this the sole exit is
                            Delete, which also destroys their newsletter record */}
                        {p.status === "declined" && p.wantsDiscord ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy === `${p.id}:requeue`}
                            onClick={() => act(p.id, "requeue")}
                          >
                            Back to queue
                          </Button>
                        ) : null}
                        {canResend ? (
                          <Button type="button" variant="outline" size="sm" disabled={busy === `${p.id}:resend`} onClick={() => act(p.id, "resend")}>
                            Resend invite
                          </Button>
                        ) : null}
                        {canRetrySync ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy === `${p.id}:retry-sync`}
                            onClick={() => act(p.id, "retry-sync")}
                          >
                            Retry sync
                          </Button>
                        ) : null}
                        {/* the server gate is the real one; this just stops offering a
                            member the single action their role cannot complete */}
                        {isAdmin ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={busy === `${p.id}:delete`}
                            onClick={() => {
                              if (confirm(`Delete ${p.email ?? p.name ?? p.id}? This cannot be undone.`)) act(p.id, "delete");
                            }}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                      {declineFor === p.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason"
                            maxLength={300}
                            className="max-w-xs"
                          />
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                            Notify them
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy === `${p.id}:decline`}
                            onClick={() => act(p.id, "decline", { reason, notify })}
                          >
                            Confirm decline
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
