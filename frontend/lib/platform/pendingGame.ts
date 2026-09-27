/**
 * Decide what happens to a shared WP link's pending game id once its
 * season's game list has resolved — successfully (any number of games) or
 * with a failure (network error, or the release is missing a required
 * column). A pending id is spent by exactly ONE resolution: apply it if the
 * list actually contains it, otherwise drop it — a season that loaded but
 * came back empty, or that failed outright, drops the pending id exactly
 * like a season that loaded fine but doesn't have that game.
 *
 * Never re-apply a stale id to a later, unrelated season's list: game ids
 * are not unique across seasons, so a caller loading a season the user
 * picked by hand (rather than the one the link named) must clear `pending`
 * itself first, before calling this — this function only spends whatever
 * pending id it's handed.
 */
export type GamesOutcome<G extends { id: string }> = { games: G[] } | { failed: true };

export function resolvePendingGame<G extends { id: string }>(
  pending: string,
  outcome: GamesOutcome<G>
): { toLoad: string; nextPending: string } {
  if (!pending || "failed" in outcome) return { toLoad: "", nextPending: "" };
  return { toLoad: outcome.games.some((g) => g.id === pending) ? pending : "", nextPending: "" };
}
