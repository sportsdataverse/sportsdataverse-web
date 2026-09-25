/**
 * Discord invite minting. One endpoint, one shape: a 3-use, 7-day invite on a
 * single welcome channel, so the bot needs only *Create Instant Invite* there.
 * No invite link is ever public — every code is minted for one person.
 * Docs: https://discord.com/developers/docs/resources/channel#create-channel-invite
 */
const API = "https://discord.com/api/v10";

export const INVITE_MAX_USES = 3; // a couple of spare uses: people mis-click, links get re-opened
export const INVITE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export type DiscordDeps = {
  botToken: string | undefined;
  channelId: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export function inviteUrl(code: string): string {
  return `https://discord.gg/${code}`;
}

export async function createInvite(deps: DiscordDeps): Promise<{ code: string; expiresAt: Date }> {
  if (!deps.botToken) throw new Error("DISCORD_BOT_TOKEN is not set");
  if (!deps.channelId) throw new Error("DISCORD_INVITE_CHANNEL_ID is not set");
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(`${API}/channels/${deps.channelId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bot ${deps.botToken}` },
      body: JSON.stringify({ max_uses: INVITE_MAX_USES, max_age: INVITE_MAX_AGE_SEC, unique: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    // a timeout or a dead network rejects here, not with a Response — label it like the rest
    throw new Error(`Discord request failed: ${(e as Error).message}`);
  }
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { code?: unknown; expires_at?: unknown };
  if (typeof body.code !== "string" || !body.code) throw new Error("Discord response had no invite code");
  const now = (deps.now ?? (() => new Date()))();
  const expiresAt =
    typeof body.expires_at === "string" ? new Date(body.expires_at) : new Date(now.getTime() + INVITE_MAX_AGE_SEC * 1000);
  return { code: body.code, expiresAt };
}

/** Approximate member count for the Population tab. Best-effort and quiet:
 *  null when unconfigured, on any error, or after 5 seconds — a slow Discord
 *  must never hold up the page. */
export async function fetchMemberCount(deps: { botToken?: string; guildId?: string; fetchImpl?: typeof fetch }): Promise<number | null> {
  if (!deps.botToken || !deps.guildId) return null;
  try {
    const res = await (deps.fetchImpl ?? fetch)(`${API}/guilds/${deps.guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${deps.botToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { approximate_member_count?: unknown };
    return typeof body.approximate_member_count === "number" ? body.approximate_member_count : null;
  } catch {
    return null;
  }
}
