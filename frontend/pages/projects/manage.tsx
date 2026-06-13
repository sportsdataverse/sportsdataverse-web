import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import type { GetServerSidePropsContext } from "next";
import { getServerSession } from "next-auth/next";
import { signIn, signOut } from "next-auth/react";
import { Github, Pencil, Trash2, Plus } from "lucide-react";
import { authOptions } from "@lib/auth";
import { Button } from "@components/ui/button";
import ProjectForm from "@components/ProjectForm";
import type { ProjectInput, ProjectDoc } from "@lib/projectSchema";

type ManageProps = {
  authorized: boolean;
  signedIn: boolean;
  login: string | null;
  isAdmin: boolean;
  projects: ProjectDoc[];
};

export default function ManageProjects({
  authorized,
  signedIn,
  login,
  isAdmin,
  projects,
}: ManageProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProjectDoc | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = (p: ProjectDoc) => isAdmin || (!!login && p.createdBy === login);

  // --- Auth gate -----------------------------------------------------------
  if (!authorized) {
    return (
      <>
        <Head>
          <title>Manage Projects · SportsDataverse</title>
        </Head>
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text font-sarina text-3xl font-bold text-transparent">
            Manage Projects
          </h1>
          {signedIn ? (
            <p className="font-inter text-muted-foreground">
              Your GitHub account isn&apos;t an active member of the{" "}
              <span className="font-semibold">sportsdataverse</span> organization,
              so you can&apos;t add projects. If you believe this is a mistake,
              ask an org admin to confirm your membership.
            </p>
          ) : (
            <p className="font-inter text-muted-foreground">
              Members of the{" "}
              <span className="font-semibold">sportsdataverse</span> GitHub
              organization can show off their projects here. Sign in to continue.
            </p>
          )}
          <div className="flex gap-3">
            {signedIn ? (
              <Button variant="outline" onClick={() => signOut()}>
                Sign out
              </Button>
            ) : (
              <Button onClick={() => signIn("github", { callbackUrl: "/projects/manage" })}>
                <Github className="mr-2 h-4 w-4" /> Sign in with GitHub
              </Button>
            )}
          </div>
        </div>
      </>
    );
  }

  // --- Mutations -----------------------------------------------------------
  async function refresh() {
    await router.replace(router.asPath, undefined, { scroll: false });
  }

  async function handleSubmit(values: ProjectInput) {
    setSubmitting(true);
    setError(null);
    try {
      const isEdit = Boolean(editing?._id);
      const res = await fetch("/api/projects", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { _id: editing!._id, ...values } : values),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Request failed");
      }
      setEditing(null);
      setAdding(false);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(project: ProjectDoc) {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: project._id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Delete failed");
      }
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // --- Authorized view -----------------------------------------------------
  return (
    <>
      <Head>
        <title>Manage Projects · SportsDataverse</title>
      </Head>
      <div className="mx-auto max-w-4xl px-6 py-24">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text font-sarina text-3xl font-bold text-transparent">
              Manage Projects
            </h1>
            <p className="mt-1 font-inter text-sm text-muted-foreground">
              Signed in as <span className="font-semibold">@{login}</span> · you
              can edit the projects you add{isAdmin ? " (admin: any project)" : ""}.{" "}
              <Link href="/packages/manage" className="text-primary hover:underline">
                Manage packages →
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!adding && !editing ? (
              <Button onClick={() => setAdding(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add project
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {(adding || editing) && (
          <div className="mb-8">
            <h2 className="mb-3 font-barlow text-xl font-semibold">
              {editing ? `Edit ${editing.name}` : "Add a new project"}
            </h2>
            <ProjectForm
              // Remount on target change so the form never shows stale values
              // when switching Add -> Edit or between different projects.
              key={editing?._id ?? "new-project"}
              initial={editing ?? undefined}
              submitting={submitting}
              onSubmit={handleSubmit}
              onCancel={() => {
                setEditing(null);
                setAdding(false);
                setError(null);
              }}
            />
          </div>
        )}

        <div className="space-y-3">
          {projects.length === 0 ? (
            <p className="font-inter text-muted-foreground">
              No projects yet. Add the first one.
            </p>
          ) : (
            projects.map((project) => (
              <div
                key={project._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white/70 px-4 py-3 dark:border-gray-700 dark:bg-darkSecondary/70"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-barlow text-lg font-semibold">
                      {project.name}
                    </span>
                    {project.createdBy ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary dark:bg-white/10 dark:text-sky-300">
                        @{project.createdBy}
                      </span>
                    ) : null}
                    {project.pinned === false ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        Hidden
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate font-inter text-sm text-muted-foreground">
                    {project.description}
                  </p>
                </div>
                {canManage(project) ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${project.name}`}
                      onClick={() => {
                        setEditing(project);
                        setAdding(false);
                        setError(null);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${project.name}`}
                      onClick={() => handleDelete(project)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {project.createdBy ? `by @${project.createdBy}` : "—"}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const signedIn = Boolean(session);
  const authorized = Boolean(session?.isOrgMember);

  if (!authorized) {
    return {
      props: { authorized: false, signedIn, login: null, isAdmin: false, projects: [] },
    };
  }

  // Read the listing from the public API on the SAME deployment (host-derived
  // base URL — Vercel previews report NODE_ENV "production", so a DEV/PROD env
  // switch would read prod while writes target the preview).
  const host = ctx.req.headers.host;
  const proto =
    (ctx.req.headers["x-forwarded-proto"] as string | undefined) ||
    (host?.startsWith("localhost") ? "http" : "https");
  const baseUrl = host
    ? `${proto}://${host}`
    : process.env.NODE_ENV !== "production"
      ? process.env.DEV_URL
      : process.env.PROD_URL;
  let projects: ProjectDoc[] = [];
  try {
    const response = await fetch(`${baseUrl}/api/projects`);
    if (response.ok) {
      const data = await response.json();
      projects = Array.isArray(data?.message) ? data.message : [];
    }
  } catch {
    projects = [];
  }

  return {
    props: {
      authorized: true,
      signedIn,
      login: session?.login ?? null,
      isAdmin: session?.role === "admin",
      projects,
    },
  };
}
