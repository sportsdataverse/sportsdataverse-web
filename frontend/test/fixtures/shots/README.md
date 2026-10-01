# Shot fixtures

One real 2025-26 game per `/platform/shots` source, as the Data API returned it
on 2026-10-01 (`https://data.sportsdataverse.org/v1/<schema>/<table>?game_id=<id>&limit=1000&select=<columns>`,
read key in `Authorization: Bearer`). Each file is the raw response (`{count, data, next}`)
trimmed to the columns `normalizeShot` and the tests read. They pin the constants in
`lib/platform/viz/surfaces.ts` (`test/surfaces.test.ts`); refetch rather than hand-edit.

| File | Source | Game | Rows | Bytes | Columns |
|---|---|---|---|---|---|
| `nba_stats-0022500013.json` | `nba_stats.shots` | `0022500013` | 205 | 29,815 | game_id, person_id, sub_type, shot_result, shot_distance, x_legacy, y_legacy |
| `wnba_stats-1022600022.json` | `wnba_stats.shots` | `1022600022` | 160 | 23,222 | same |
| `nba-401873201.json` | `nba.shots` | `401873201` | 245 | 49,575 | game_id, athlete_id_1, type_text, scoring_play, score_value, coordinate_x, coordinate_y, coordinate_x_raw, coordinate_y_raw |
| `wnba-401857215.json` | `wnba.shots` | `401857215` | 195 | 39,394 | same |
| `mbb-401858379.json` | `mbb.shots` | `401858379` | 202 | 39,384 | same |
| `wbb-401858323.json` | `wbb.shots` | `401858323` | 191 | 37,180 | same |
| `nhl-2025020001.json` | `nhl.pbp` | `2025020001` | 361 (every event; 82 unblocked shots) | 93,991 | game_id, event_type, event_player_1_id, event_team_abbr, event_team_type, home_abbr, away_abbr, period, x, y, x_fixed, y_fixed, shot_distance, xg, empty_net |
| `pwhl-235.json` | `pwhl.xg_pbp` | `235` | 74 | 13,517 | game_id, player_id, team_id, event_type, x_coord, y_coord, shot_distance, shot_angle, goal, xg |

Games were the `season=2026` game with the most rows among the first 4,000 returned.
