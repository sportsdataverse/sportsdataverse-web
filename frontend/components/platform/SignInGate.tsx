"use client";

import { signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Github } from "lucide-react";
import { Button } from "@components/ui/button";

/** Members-only gate for the /platform area (App Router side). */
export default function SignInGate({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="font-display text-4xl font-bold uppercase tracking-tight">
        SportsDataverse Platform
      </h1>
      {signedIn ? (
        <p className="text-muted-foreground">
          Your GitHub account isn&apos;t an active member of the{" "}
          <span className="font-semibold">sportsdataverse</span> organization,
          so the platform is off limits. If you believe this is a mistake, ask
          an org admin to confirm your membership.
        </p>
      ) : (
        <p className="text-muted-foreground">
          The platform (automation, pipelines, datasets, model runs, database
          status) is available to members of the{" "}
          <span className="font-semibold">sportsdataverse</span> GitHub
          organization. Sign in to continue.
        </p>
      )}
      <div className="flex gap-3">
        {signedIn ? (
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        ) : (
          <Button onClick={() => signIn("github", { callbackUrl: pathname ?? "/platform" })}>
            <Github className="mr-2 h-4 w-4" /> Sign in with GitHub
          </Button>
        )}
      </div>
    </div>
  );
}
