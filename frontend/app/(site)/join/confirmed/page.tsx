import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@components/site/PageHeader";
import FollowUs from "@components/site/FollowUs";

export const metadata: Metadata = { title: "Subscription confirmed", robots: { index: false } };

const COPY = {
  ok: { title: "You're on the list", body: "Your email is confirmed. The next issue will find you." },
  expired: { title: "That link has expired", body: "Confirmation links last 7 days. Sign up again and we'll send a fresh one." },
  invalid: { title: "That link didn't work", body: "It may have been cut off in your mail client. Sign up again and we'll send a fresh one." },
} as const;

export default async function ConfirmedPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const key: keyof typeof COPY = state && state in COPY ? (state as keyof typeof COPY) : "ok";
  const c = COPY[key];
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      <PageHeader eyebrow="Newsletter" title={c.title}>{c.body}</PageHeader>
      <div className="mt-10 space-y-10">
        {key === "ok" ? (
          <FollowUs placement="confirmed" />
        ) : (
          <Link href="/join" className="text-primary underline-offset-4 hover:underline">Sign up again</Link>
        )}
      </div>
    </div>
  );
}
