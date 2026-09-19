import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { handleConfirm } from "@lib/join";

/** Double opt-in link target: verifies the signed token, creates the Resend contact, redirects. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const { db } = await connectToDatabase();
  const { redirect } = await handleConfirm(token, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    tokenSecret: process.env.JOIN_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET,
    siteUrl: url.origin,
    log: (m) => console.warn(m),
  });
  return NextResponse.redirect(new URL(redirect, url.origin), { status: 303 });
}
