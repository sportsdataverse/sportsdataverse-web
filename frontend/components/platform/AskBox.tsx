"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { CornerDownLeft, X } from "lucide-react";
import fetcher from "@lib/fetcher";
import { cn } from "@lib/utils";
import { Input } from "@components/ui/input";
import { Button } from "@components/ui/button";
import { EDITABLE, askHref, editChip, parseAsk, stateOf, type Chip } from "@lib/platform/ask/parse";

const EXAMPLE = "QBs with EPA/play over 0.2 in 2025, min 200 dropbacks";

/**
 * The Query page's Ask box (spec D3, rules only): a question becomes chips the reader can edit or
 * remove, words no rule placed are shown back, and Enter opens the Query view the chips describe.
 */
export default function AskBox({ schemas }: { schemas: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  // a bare /platform/query shows the first schema (parseQueryView's fallback), so that is the page's league
  const base = useMemo(() => ({ schema: sp.get("schema") || schemas[0] || "", table: sp.get("table") ?? "" }), [sp, schemas]);
  const [text, setText] = useState("");
  /** Chip edits and removals, kept while the question they were made on is unchanged. */
  const [edited, setEdited] = useState<{ text: string; chips: Chip[] } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // A first pass names the league; that league's catalog (the same request QueryBuilder makes, so SWR
  // shares it) lets the second pass drop filters on columns the table does not have.
  const first = useMemo(() => parseAsk(text, { schemas, base }), [text, schemas, base]);
  const schema = first.chips.length ? first.state.query.schema : "";
  const { data: catalog } = useSWR<{ tables: Record<string, Record<string, string>> }>(
    schema ? `/api/platform/query/tables?schema=${schema}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const result = useMemo(
    () =>
      parseAsk(text, {
        schemas,
        base,
        columns: (s, t) => (s === schema && catalog?.tables?.[t] ? Object.keys(catalog.tables[t]) : undefined),
      }),
    [text, schemas, base, schema, catalog]
  );
  // an edit made before the catalog arrived must not keep a filter the catalog has since dropped
  const chips = edited?.text === text ? edited.chips.filter((c) => result.chips.some((r) => r.id === c.id)) : result.chips;
  const setChips = (next: Chip[]) => setEdited({ text, chips: next });

  function apply() {
    if (!chips.length) return;
    router.push(askHref(stateOf(chips, schemas)));
  }

  return (
    <form
      role="search"
      aria-label="Ask the warehouse"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label="Ask"
          name="ask"
          autoComplete="off"
          className="font-mono text-sm"
          placeholder={`Ask: ${EXAMPLE}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5" disabled={!chips.length}>
          <CornerDownLeft className="size-4" aria-hidden /> Apply
        </Button>
      </div>

      {chips.length ? (
        <ul aria-label="Understood as" className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <li
              key={c.id}
              title={c.implied ? `Not in the question: ${c.implied}` : undefined}
              className={cn(
                "flex min-h-6 items-center gap-1 rounded-md border pl-2 font-mono text-[11px]",
                c.implied ? "border-dashed border-border text-muted-foreground" : "border-primary/50 bg-primary/10 text-foreground"
              )}
            >
              {c.label ? <span className="text-muted-foreground">{c.label}</span> : null}
              {editing === c.id ? (
                <ChipEditor
                  chip={c}
                  onDone={(next) => {
                    if (next) setChips(chips.map((x) => (x.id === c.id ? next : x)));
                    setEditing(null);
                  }}
                />
              ) : EDITABLE.includes(c.kind) ? (
                <button
                  type="button"
                  className="min-h-6 underline decoration-dotted underline-offset-2 hover:text-primary"
                  aria-label={`Edit ${c.label} ${c.display}`}
                  onClick={() => setEditing(c.id)}
                >
                  {c.display}
                </button>
              ) : (
                <span>
                  {c.display}
                  {c.implied ? ` · ${c.implied}` : ""}
                </span>
              )}
              <button
                type="button"
                className="grid min-h-6 min-w-6 place-items-center rounded-r-md text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${c.label} ${c.display}`.replace(/\s+/g, " ")}
                onClick={() => setChips(chips.filter((x) => x.id !== c.id))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
          <li className="font-mono text-[11px] text-muted-foreground">Enter to open</li>
        </ul>
      ) : null}

      {result.ignored.length ? (
        <p className="font-mono text-xs text-muted-foreground" data-testid="ask-ignored">
          ignored: {result.ignored.map((w) => `“${w}”`).join(", ")}
        </p>
      ) : null}
    </form>
  );
}

/** A chip's value in place: Enter or blur keeps a valid value, Escape (or an invalid one) cancels. */
function ChipEditor({ chip, onDone }: { chip: Chip; onDone: (next: Chip | null) => void }) {
  const [value, setValue] = useState(chip.display);
  const next = editChip(chip, value);
  return (
    <input
      autoFocus
      aria-label={`${chip.label} value`}
      aria-invalid={!next}
      className="h-6 w-20 rounded border border-input bg-background px-1 font-mono text-[11px] aria-[invalid=true]:border-destructive"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(next)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault(); // the edit, not the form
          onDone(next);
        } else if (e.key === "Escape") onDone(null);
      }}
    />
  );
}
