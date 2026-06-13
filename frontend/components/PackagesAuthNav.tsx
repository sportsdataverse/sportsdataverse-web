"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Settings } from "lucide-react";

/**
 * Navbar control that surfaces a "Manage" link to the package CMS, but only for
 * signed-in sportsdataverse org members. Everyone else sees nothing (the manage
 * page itself handles the sign-in gate), so the public nav stays uncluttered.
 */
export default function PackagesAuthNav() {
  const { data: session, status } = useSession();
  if (status !== "authenticated" || !session?.isOrgMember) return null;

  return (
    <Link
      href="/packages/manage"
      aria-label="Manage packages"
      title="Manage packages"
      className="hidden items-center gap-1 rounded-md px-2 py-[3px] text-[15px] text-gray-600 transition-all hover:bg-black/10 sm:inline-flex dark:text-gray-300 dark:hover:bg-neutral-700/50"
    >
      <Settings className="h-4 w-4" />
      <span className="hidden md:inline">Manage</span>
    </Link>
  );
}
