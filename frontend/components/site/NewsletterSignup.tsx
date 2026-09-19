"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";

type Phase = "idle" | "sending" | "done" | "error";

/**
 * Newsletter signup → POST /api/join. Native email validation; the server
 * stores the person first and syncs Resend second (lib/join.ts).
 */
export default function NewsletterSignup({ placement }: { placement: "footer" | "about" }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get("email");
    setPhase("sending");
    setMessage("");
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, wants: { newsletter: true }, placement }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setPhase(res.ok ? "done" : "error");
      setMessage(body.message ?? (res.ok ? "You're on the list." : "Something went wrong."));
      if (res.ok) form.reset();
    } catch {
      setPhase("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6" aria-label="Newsletter sign-up">
      <label htmlFor={`newsletter-email-${placement}`} className="eyebrow">
        Newsletter
      </label>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        New data, methods posts, and package releases. No spam.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          id={`newsletter-email-${placement}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={phase === "sending"}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={phase === "sending"}>
          {phase === "sending" ? "Sending…" : "Subscribe"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-4 text-xs ${phase === "error" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {message}
      </p>
    </form>
  );
}
