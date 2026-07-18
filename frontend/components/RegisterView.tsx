"use client";

import { useEffect } from "react";

/** Fire-and-forget view-counter ping (client island under a server page). */
export default function RegisterView({ slug }: { slug: string }) {
  useEffect(() => {
    fetch(`/api/views/${slug}`, { method: "POST" });
  }, [slug]);
  return null;
}
