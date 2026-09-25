import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireMemberApp } from "@lib/platform/auth";
import { loadPopulation } from "@lib/population";

/** Aggregates only — every org member may read it, so it carries counts and
 *  nothing that identifies a person. */
export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const { db } = await connectToDatabase();
  const population = await loadPopulation(db, {
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordGuildId: process.env.DISCORD_GUILD_ID,
    plausibleApiKey: process.env.PLAUSIBLE_API_KEY,
    plausibleSiteId: process.env.PLAUSIBLE_SITE_ID,
  });
  return NextResponse.json({ population });
}
