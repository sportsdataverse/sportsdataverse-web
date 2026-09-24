"use client";

import { useSession, signIn } from "next-auth/react";
import { Github } from "lucide-react";
import { Button } from "@components/ui/button";

/**
 * The optional GitHub sign-in the spec puts on `/join` ("Pages and routes").
 * `/api/join` only ever sees a viewer when the visitor already holds a session,
 * so without this button the auto-admit path is unreachable for exactly the
 * people it was built for: non-members with a merged PR in the org. The nav's
 * "Member sign in" cannot stand in for it — it is labelled for members and
 * sends you to /platform, not back to this form.
 */
export default function JoinSignIn() {
  const { data: session, status } = useSession();

  if (session?.login) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <p className="eyebrow">Signed in</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          GitHub knows you as{" "}
          <span className="font-medium text-foreground">@{session.login}</span>. If you&apos;re in the
          sportsdataverse org or have a merged pull request there, your Discord invite is issued the
          moment you submit — no review queue.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <p className="eyebrow">Optional</p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Contributed to a SportsDataverse repo, or in the GitHub org? Sign in and we&apos;ll issue your
        Discord invite on the spot instead of queueing you for a member to review. The form works
        either way.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4 gap-2"
        disabled={status === "loading"}
        onClick={() => signIn("github", { callbackUrl: "/join" })}
      >
        <Github className="size-3.5" aria-hidden="true" /> Sign in with GitHub
      </Button>
    </div>
  );
}
