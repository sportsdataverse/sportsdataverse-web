"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-mono text-sm text-status-failed">error</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Something went wrong
      </h1>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">
          digest: {error.digest}
        </p>
      ) : null}
      <button
        onClick={reset}
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Try again
      </button>
    </main>
  );
}
