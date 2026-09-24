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

type View = "queue" | "unsynced" | "all";
type Action = "approve" | "decline" | "resend" | "retry-sync" | "delete";

type PersonRow = {
  id: string;
  email: string | null;
  name: string | null;
  githubLogin: string | null;
  status: "pending" | "approved" | "declined" | "auto" | "survey";
  wantsDiscord: boolean;
  wantsNewsletter: boolean;
  newsletterState: "synced" | "pending" | "skipped" | "none";
  discordCode: string | null;
  createdAt: string;
  reviewedBy: string | null;
  declineReason: string | null;
};

type ActionResult = { success: boolean; message: string; inviteUrl?: string };

const VIEWS: { value: View; label: string }[] = [
  { value: "queue", label: "Queue" },
  { value: "unsynced", label: "Unsynced newsletter" },
  { value: "all", label: "All" },
];

const STATUS_VARIANT: Record<PersonRow["status"], "default" | "outline" | "destructive" | "secondary"> = {
  pending: "outline",
  approved: "default",
  auto: "default",
  declined: "destructive",
  survey: "secondary",
};

export default function PeopleClient() {
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
    setLoadError(false);
    try {
      const res = await fetch(`/api/platform/admin/people?view=${v}`);
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
      const res = await fetch(`/api/platform/admin/people/${id}/${action}`, {
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

      {loadError ? (
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
                const canResend = Boolean(p.discordCode) || p.status === "approved" || p.status === "auto";
                const canRetrySync = p.wantsNewsletter && p.newsletterState !== "synced";
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name ?? p.email ?? p.id}</div>
                      {p.email ? <div className="text-xs text-muted-foreground">{p.email}</div> : null}
                      {p.githubLogin ? <div className="text-xs text-muted-foreground">@{p.githubLogin}</div> : null}
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
                        {p.status === "pending" ? (
                          <>
                            {/* approve mints a Discord invite — never offer it to someone who
                                didn't ask for Discord; lib/review.ts's approve() refuses this too */}
                            {p.wantsDiscord ? (
                              <Button type="button" size="sm" disabled={busy === `${p.id}:approve`} onClick={() => act(p.id, "approve")}>
                                Approve
                              </Button>
                            ) : null}
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
                      </div>
                      {declineFor === p.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason"
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
