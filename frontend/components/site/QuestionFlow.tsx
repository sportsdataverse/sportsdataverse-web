"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select";
import FollowUs from "@components/site/FollowUs";
import SupportCallout from "@components/site/SupportCallout";
import { JOIN_SECTIONS, QUESTIONS, SURVEY_SECTIONS, type Answers, type Question, type Section } from "@content/survey";
import { REPO_TYPES } from "@lib/packageSchema";
import { visibleQuestions } from "@lib/survey";

// No shadcn Textarea in this repo's components/ui/ — matched to Input's own
// classes (components/ui/input.tsx) rather than inventing a different look.
const textareaClass =
  "min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

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
  const [pkg, setPkg] = useState({
    title: "", repoType: "R" as (typeof REPO_TYPES)[number], sports: "", content: "",
    sourceHref: "", docsHref: "", logoHref: "", dataRepoHref: "", orgTier: false,
  });
  const wantsPackage = answers.wants_package === "yes";
  const [sticker, setSticker] = useState({
    name: "", line1: "", line2: "", city: "", region: "", postal: "", country: "",
  });
  const wantsStickers = answers.wants_stickers === "yes";
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
    const body = isJoin
      ? {
          email: contact.email,
          name: contact.name.trim() || undefined,
          answers,
          placement,
          // omitted entirely unless they said yes, so the flag and the payload agree
          ...(wantsPackage
            ? {
                pkg: {
                  ...pkg,
                  docsHref: pkg.docsHref.trim() || undefined,
                  logoHref: pkg.logoHref.trim() || undefined,
                  dataRepoHref: pkg.dataRepoHref.trim() || undefined,
                },
              }
            : {}),
          ...(wantsStickers
            ? {
                sticker: {
                  name: sticker.name,
                  address: {
                    line1: sticker.line1,
                    line2: sticker.line2.trim() || undefined,
                    city: sticker.city,
                    region: sticker.region.trim() || undefined,
                    postal: sticker.postal.trim() || undefined,
                    country: sticker.country,
                  },
                },
              }
            : {}),
        }
      : { answers };
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
            <Input aria-label={q.label} value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} required={q.required} maxLength={200} />
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

      {isJoin && last && wantsPackage ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Your package</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="Package name" placeholder="Package name" required maxLength={120} value={pkg.title}
              onChange={(e) => setPkg((p) => ({ ...p, title: e.target.value }))} />
            <Select value={pkg.repoType} onValueChange={(v) => setPkg((p) => ({ ...p, repoType: v as (typeof REPO_TYPES)[number] }))}>
              <SelectTrigger className="w-full" aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPO_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input aria-label="Sport or category" placeholder="Sport or category (e.g. MBB)" required maxLength={120} value={pkg.sports}
              onChange={(e) => setPkg((p) => ({ ...p, sports: e.target.value }))} />
            <Input type="url" aria-label="Source repository URL" placeholder="https://github.com/you/your-package" required value={pkg.sourceHref}
              onChange={(e) => setPkg((p) => ({ ...p, sourceHref: e.target.value }))} />
            <Input type="url" aria-label="Documentation URL (optional)" placeholder="https://your-package-docs.example (optional)" value={pkg.docsHref}
              onChange={(e) => setPkg((p) => ({ ...p, docsHref: e.target.value }))} />
            <Input type="url" aria-label="Logo image URL (optional)" placeholder="https://your-site.example/logo.png (optional)" value={pkg.logoHref}
              onChange={(e) => setPkg((p) => ({ ...p, logoHref: e.target.value }))} />
            <Input type="url" aria-label="Data repository URL (optional)" placeholder="https://github.com/you/your-data-repo (optional)" value={pkg.dataRepoHref}
              onChange={(e) => setPkg((p) => ({ ...p, dataRepoHref: e.target.value }))} />
          </div>
          <textarea aria-label="What your package does" className={textareaClass}
            placeholder="What does it do?" required maxLength={2000} value={pkg.content}
            onChange={(e) => setPkg((p) => ({ ...p, content: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pkg.orgTier} onChange={(e) => setPkg((p) => ({ ...p, orgTier: e.target.checked }))} />
            Consider this for the sportsdataverse GitHub org
          </label>
        </fieldset>
      ) : null}

      {isJoin && last && wantsStickers ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Where should we mail the stickers?</legend>
          <p className="text-sm text-muted-foreground">
            Used only to mail them. We delete the address as soon as they ship.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="Name on the envelope" placeholder="Name on the envelope" autoComplete="name" required maxLength={80}
              value={sticker.name} onChange={(e) => setSticker((s) => ({ ...s, name: e.target.value }))} />
            <Input aria-label="Country" placeholder="Country" autoComplete="country-name" required maxLength={56}
              value={sticker.country} onChange={(e) => setSticker((s) => ({ ...s, country: e.target.value }))} />
            <Input aria-label="Address line 1" placeholder="Address line 1" autoComplete="address-line1" required maxLength={120}
              value={sticker.line1} onChange={(e) => setSticker((s) => ({ ...s, line1: e.target.value }))} />
            <Input aria-label="Address line 2 (optional)" placeholder="Address line 2 (optional)" autoComplete="address-line2" maxLength={120}
              value={sticker.line2} onChange={(e) => setSticker((s) => ({ ...s, line2: e.target.value }))} />
            <Input aria-label="City" placeholder="City" autoComplete="address-level2" required maxLength={80}
              value={sticker.city} onChange={(e) => setSticker((s) => ({ ...s, city: e.target.value }))} />
            <Input aria-label="State / region (if any)" placeholder="State / region (if any)" autoComplete="address-level1" maxLength={80}
              value={sticker.region} onChange={(e) => setSticker((s) => ({ ...s, region: e.target.value }))} />
            <Input aria-label="Postal code (if any)" placeholder="Postal code (if any)" autoComplete="postal-code" maxLength={20}
              value={sticker.postal} onChange={(e) => setSticker((s) => ({ ...s, postal: e.target.value }))} />
          </div>
        </fieldset>
      ) : null}

      {isJoin && last ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Where can we reach you?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="text" aria-label="Name (optional)" placeholder="Name (optional)" autoComplete="name" value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} maxLength={80} />
            <Input type="email" aria-label="Email address" placeholder="you@example.com" autoComplete="email" required value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
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
