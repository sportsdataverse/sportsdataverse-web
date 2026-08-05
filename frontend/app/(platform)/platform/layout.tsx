import type { Metadata } from "next";
import { auth } from "@lib/auth";
import SignInGate from "@components/platform/SignInGate";
import PlatformSidebar from "@components/platform/PlatformSidebar";
import PlatformTopbar from "@components/platform/PlatformTopbar";
import CommandMenu from "@components/platform/CommandMenu";
import PlatformBeacon from "@components/platform/PlatformBeacon";

export const metadata: Metadata = {
  title: { default: "Platform", template: "%s · SDV Platform" },
  robots: { index: false },
};

// Session-gated on every request.
export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.isOrgMember) {
    return <SignInGate signedIn={Boolean(session)} />;
  }

  const isAdmin = session.role === "admin";
  return (
    <div className="flex min-h-dvh">
      <PlatformSidebar isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PlatformTopbar login={session.login ?? null} isAdmin={isAdmin} />
        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
      <CommandMenu />
      <PlatformBeacon login={session.login ?? null} />
    </div>
  );
}
