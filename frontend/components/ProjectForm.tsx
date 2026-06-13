"use client";

import { useState } from "react";
import { Button } from "@components/ui/button";
import type { ProjectInput, ProjectDoc } from "@lib/projectSchema";

const fieldClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-gray-700 dark:bg-darkSecondary dark:text-gray-100";
const labelClass =
  "mb-1 block font-barlow text-sm font-semibold text-gray-700 dark:text-gray-200";

type FormState = {
  name: string;
  description: string;
  githubURL: string;
  coverImage: string;
  previewURL: string;
  tools: string;
  pinned: boolean;
};

function toFormState(initial?: Partial<ProjectDoc>): FormState {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    githubURL: initial?.githubURL ?? "",
    coverImage: initial?.coverImage ?? "",
    previewURL: initial?.previewURL ?? "",
    tools: (initial?.tools ?? []).join(", "),
    pinned: initial?.pinned ?? true,
  };
}

export default function ProjectForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ProjectDoc>;
  submitting?: boolean;
  onSubmit: (values: ProjectInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tools = form.tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      githubURL: form.githubURL.trim(),
      coverImage: form.coverImage.trim() || undefined,
      previewURL: form.previewURL.trim() || undefined,
      tools,
      pinned: form.pinned,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-gray-200 bg-white/80 p-6 shadow-sm dark:border-gray-700 dark:bg-darkSecondary/80"
    >
      <div>
        <label className={labelClass} htmlFor="name">
          Project name
        </label>
        <input
          id="name"
          className={fieldClass}
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Game on Paper"
          required
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          className={`${fieldClass} min-h-[96px] resize-y`}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Live win probability, EPA, and advanced box scores for college football."
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="githubURL">
            Source repo URL
          </label>
          <input
            id="githubURL"
            type="url"
            className={fieldClass}
            value={form.githubURL}
            onChange={(e) => update("githubURL", e.target.value)}
            placeholder="https://github.com/sportsdataverse/..."
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="previewURL">
            Live preview URL (optional)
          </label>
          <input
            id="previewURL"
            type="url"
            className={fieldClass}
            value={form.previewURL}
            onChange={(e) => update("previewURL", e.target.value)}
            placeholder="https://gameonpaper.com/cfb"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="coverImage">
            Cover image URL (optional)
          </label>
          <input
            id="coverImage"
            type="url"
            className={fieldClass}
            value={form.coverImage}
            onChange={(e) => update("coverImage", e.target.value)}
            placeholder="https://.../cover.png"
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="tools">
          Tools / tech (comma-separated)
        </label>
        <input
          id="tools"
          className={fieldClass}
          value={form.tools}
          onChange={(e) => update("tools", e.target.value)}
          placeholder="R, Python, Next.js, Cloudflare"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
          checked={form.pinned}
          onChange={(e) => update("pinned", e.target.checked)}
        />
        Visible on the projects page
      </label>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial?._id ? "Save changes" : "Add project"}
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
