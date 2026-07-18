import Link from "next/link";
import React from "react";

export default function CreateAnIssue() {
  return (
    <div className="grid w-full min-h-[60vh] px-10 sm:px-20 place-items-center text-foreground">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-3">
        We couldn&apos;t load this page&apos;s data. Let me know by{" "}
        <Link
          href="https://github.com/sportsdataverse/sportsdataverse-web/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold underline hover:text-accent "
        >
          creating an issue
        </Link>{" "}
        on GitHub.
        </p>
      </div>
    </div>
  );
}
