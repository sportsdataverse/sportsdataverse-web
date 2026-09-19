"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import FollowUs from "@components/site/FollowUs";
import SupportCallout from "@components/site/SupportCallout";
import { JOIN_SECTIONS, QUESTIONS, SURVEY_SECTIONS, type Answers, type Question, type Section } from "@content/survey";
import { visibleQuestions } from "@lib/survey";

type Props = {
  mode: "survey" | "join";
  /** options for questions with `optionsKey`, filled by the server page (plain data only) */
  dynamicOptions: Record<string, { value: string; label: string }[]>;
};

const SECTION_TITLES: Record<Section, string> = {
  profile: "About you",
  discovery: "How you find us",
  followup: "A little more",
  wants: "What you'd like",
};

// The question list is imported here, not passed as a prop: it carries `showIf`
// functions, which a server component cannot serialise into client props.
export default function QuestionFlow({ mode, dynamicOptions }: Props) {
  const questions = QUESTIONS;
  const sections: Section[] = mode === "join" ? JOIN_SECTIONS : SURVEY_SECTIONS;
  const submitTo = mode === "join" ? "/api/join" : "/api/survey";
  const placement = mode === "join" ? "join" : undefined;
  const [answers, setAnswers] = useState<Answers>({});
  const [contact, setContact] = useState({ email: "", name: "" });
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "sending" | "done" | "error">("form");
  const [message, setMessage] = useState("");

  // sections with at least one visible question, in order; a section that hides entirely is skipped.
  // Only the current-and-earlier sections are live-filtered by answers so far — a later section
  // whose questions are all showIf-gated (e.g. followup, before any profile answer exists) still
  // counts as present, so the denominator doesn't change out from under the step count as you answer.
  const steps = useMemo(
    () =>
      sections.filter((s, i) =>
        i <= step ? visibleQuestions(questions, [s], answers).length > 0 : questions.some((q) => q.section === s)
      ),
    [questions, sections, answers, step]
  );
  const section = steps[Math.min(step, steps.length - 1)];
  const visible = visibleQuestions(questions, [section], answers);
  const isJoin = submitTo === "/api/join";
  const last = step >= steps.length - 1;

  const opts = (q: Question) => q.options ?? (q.optionsKey ? dynamicOptions[q.optionsKey] ?? [] : []);
  const set = (id: string, v: string | string[]) => setAnswers((a) => ({ ...a, [id]: v }));
  const toggle = (id: string, v: string) =>
    setAnswers((a) => {
      const cur = Array.isArray(a[id]) ? (a[id] as string[]) : [];
      return { ...a, [id]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const sectionComplete = visible.every((q) => {
    if (!q.required) return true;
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });

  async function submit() {
    setPhase("sending");
    setMessage("");
    const body = isJoin ? { email: contact.email, name: contact.name.trim() || undefined, answers, placement } : { answers };
    try {
      const res = await fetch(submitTo, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setMessage(data.message ?? (res.ok ? "Thanks." : "Something went wrong."));
      setPhase(res.ok ? "done" : "error");
    } catch {
      setMessage("Network error. Try again.");
      setPhase("error");
    }
  }

  if (phase === "done") {
    return (
      <div className="space-y-10" role="status" aria-live="polite">
        <p className="text-lg">{message}</p>
        {!isJoin ? (
          <p className="text-sm text-muted-foreground">
            Want the newsletter or a Discord invite? <Link href="/join" className="text-primary underline-offset-4 hover:underline">Join here</Link>.
          </p>
        ) : null}
        <FollowUs placement={isJoin ? "join-thanks" : "survey-thanks"} />
        <SupportCallout />
      </div>
    );
  }

  return (
    <form
      className="space-y-8"
      aria-label={isJoin ? "Join form" : "Survey"}
      onSubmit={(e) => {
        e.preventDefault();
        if (last) void submit();
        else setStep((s) => s + 1);
      }}
    >
      <p className="eyebrow">
        Step {step + 1} of {steps.length} · {SECTION_TITLES[section]}
      </p>

      {visible.map((q) => (
        <fieldset key={q.id} className="space-y-3" aria-required={q.required ? "true" : undefined}>
          <legend className="font-medium">
            {q.label}
            {q.required ? <span aria-hidden className="text-muted-foreground"> *</span> : null}
          </legend>
          {q.help ? <p className="text-sm text-muted-foreground">{q.help}</p> : null}
          {q.type === "text" ? (
            <Input value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} required={q.required} maxLength={200} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {opts(q).map((o) => {
                const checked = q.type === "multi" ? (answers[q.id] as string[] | undefined)?.includes(o.value) ?? false : answers[q.id] === o.value;
                return (
                  <label
                    key={o.value}
                    className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
                      checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <input
                      type={q.type === "multi" ? "checkbox" : "radio"}
                      name={q.id}
                      value={o.value}
                      checked={checked}
                      required={q.required && q.type === "single"}
                      onChange={() => (q.type === "multi" ? toggle(q.id, o.value) : set(q.id, o.value))}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      ))}

      {isJoin && last ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Where can we reach you?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="text" placeholder="Name (optional)" autoComplete="name" value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} maxLength={80} />
            <Input type="email" placeholder="you@example.com" autoComplete="email" required value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
          </div>
        </fieldset>
      ) : null}

      <div className="flex items-center gap-3">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={phase === "sending"}>
            Back
          </Button>
        ) : null}
        <Button type="submit" disabled={!sectionComplete || phase === "sending"}>
          {phase === "sending" ? "Sending…" : last ? (isJoin ? "Join" : "Send answers") : "Next"}
        </Button>
        <p role="status" aria-live="polite" className={`text-sm ${phase === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
