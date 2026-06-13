"use client";

import { useState } from "react";
import { Button } from "@components/ui/button";
import { REPO_TYPES, type PackageInput, type PackageDoc } from "@lib/packageSchema";

const fieldClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-gray-700 dark:bg-darkSecondary dark:text-gray-100";
const labelClass =
  "mb-1 block font-barlow text-sm font-semibold text-gray-700 dark:text-gray-200";

type FormState = {
  title: string;
  repoType: (typeof REPO_TYPES)[number];
  sports: string;
  content: string;
  sourceHref: string;
  docsHref: string;
  logoHref: string;
  dataRepoHref: string;
  published: boolean;
};

function toFormState(initial?: Partial<PackageDoc>): FormState {
  return {
    title: initial?.title ?? "",
    repoType: (initial?.repoType as FormState["repoType"]) ?? "R",
    sports: initial?.sports ?? "",
    content: initial?.content ?? "",
    sourceHref: initial?.sourceHref ?? "",
    docsHref: initial?.docsHref ?? "",
    logoHref: initial?.logoHref ?? "",
    dataRepoHref: initial?.dataRepoHref ?? "",
    published: initial?.published ?? true,
  };
}

export default function PackageForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<PackageDoc>;
  submitting?: boolean;
  onSubmit: (values: PackageInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Empty optional URLs are normalized to undefined by the schema server-side,
    // but trim here for a clean payload.
    onSubmit({
      title: form.title.trim(),
      repoType: form.repoType,
      sports: form.sports.trim(),
      content: form.content.trim(),
      sourceHref: form.sourceHref.trim(),
      docsHref: form.docsHref.trim() || undefined,
      logoHref: form.logoHref.trim() || undefined,
      dataRepoHref: form.dataRepoHref.trim() || undefined,
      published: form.published,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-gray-200 bg-white/80 p-6 shadow-sm dark:border-gray-700 dark:bg-darkSecondary/80"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="title">
            Package name
          </label>
          <input
            id="title"
            className={fieldClass}
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="cfbfastR"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="repoType">
            Language
          </label>
          <select
            id="repoType"
            className={fieldClass}
            value={form.repoType}
            onChange={(e) =>
              update("repoType", e.target.value as FormState["repoType"])
            }
          >
            {REPO_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="sports">
          Sport / category
        </label>
        <input
          id="sports"
          className={fieldClass}
          value={form.sports}
          onChange={(e) => update("sports", e.target.value)}
          placeholder="College Football"
          required
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="content">
          Description
        </label>
        <textarea
          id="content"
          className={`${fieldClass} min-h-[96px] resize-y`}
          value={form.content}
          onChange={(e) => update("content", e.target.value)}
          placeholder="Clean, tidy college football play-by-play data."
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="sourceHref">
            Source repo URL
          </label>
          <input
            id="sourceHref"
            type="url"
            className={fieldClass}
            value={form.sourceHref}
            onChange={(e) => update("sourceHref", e.target.value)}
            placeholder="https://github.com/sportsdataverse/cfbfastR"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="docsHref">
            Docs / website URL
          </label>
          <input
            id="docsHref"
            type="url"
            className={fieldClass}
            value={form.docsHref}
            onChange={(e) => update("docsHref", e.target.value)}
            placeholder="https://cfbfastR.sportsdataverse.org/"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="logoHref">
            Logo image URL
          </label>
          <input
            id="logoHref"
            type="url"
            className={fieldClass}
            value={form.logoHref}
            onChange={(e) => update("logoHref", e.target.value)}
            placeholder="https://raw.githubusercontent.com/.../logo.png"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="dataRepoHref">
            Data repo URL (optional)
          </label>
          <input
            id="dataRepoHref"
            type="url"
            className={fieldClass}
            value={form.dataRepoHref}
            onChange={(e) => update("dataRepoHref", e.target.value)}
            placeholder="https://github.com/sportsdataverse/cfbfastR-data"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
          checked={form.published}
          onChange={(e) => update("published", e.target.checked)}
        />
        Published (visible on the packages page)
      </label>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial?._id ? "Save changes" : "Add package"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
