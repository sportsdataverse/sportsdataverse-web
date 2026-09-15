# Copilot instructions — sportsdataverse-web

The SportsDataverse organization website (Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui),
deployed on Vercel. **The app lives in `frontend/`** — run every node command there. `CLAUDE.md` at the
repo root is the full set of working rules; this file carries the ones for authoring and reviewing PRs.

## Every PR gets visual and performance evidence, automatically
`.github/workflows/pr-evidence.yml` runs on every same-repo PR that touches `frontend/`. It waits for
Vercel's Preview deployment of the PR head and posts or updates one comment (marked `<!-- pr-evidence -->`) with:
1. the four preview screenshots — desktop 1280×800 and mobile 390×844, each in light and dark
   (next-themes theme selected the way a visitor selects it; the site defaults to dark);
2. a Lighthouse comparison of that preview against the Production deployment of the PR's base —
   mobile + desktop, 3 runs each, median and min–max run range, regressions flagged only when the gap
   between the run ranges clears the metric's floor.

### When authoring a PR (including as the Copilot coding agent)
- Fill in `.github/pull_request_template.md`. Set `Evidence routes:` to the public pages your change affects
  most (up to 4 paths). `/platform/**` needs org auth and cannot be measured.
- Never write screenshots, scores or metrics into the PR by hand — the workflow's comment is the evidence.
  If it did not run or failed (most often because the Vercel preview failed to build), say so and link the run.
- Workflows on PRs opened by the Copilot coding agent wait for a maintainer to approve the run; note in the
  PR that the evidence comment appears after approval.
- The environment from `.github/workflows/copilot-setup-steps.yml` has the app installed plus lighthouse and
  playwright-core: `npm run lint`, `npm run tsc`, `npm run test:scripts`, and `npm run visual-check` against a
  URL you can reach. Vercel preview URLs may be outside the agent firewall; the workflow run is the one that counts.
- If the evidence comment flags a regression, fix it or explain it in the PR description.

### When reviewing a PR
- If the PR touches `frontend/` and has no `<!-- pr-evidence -->` comment, or the comment reports errors, say so first.
- Check that `Evidence routes:` covers the pages the diff changes; ask for the right routes rather than accepting
  the default for an unrelated page.
- Treat a flagged regression (🔴) as real and ask for its cause or a fix; do not raise score differences the
  comment classifies as noise. Server response differences between Production and Preview are not regressions.
- Dark mode is the default theme: a change that only looks right in light mode is a bug.

## Other rules
- Branch + PR; never push `main` (Vercel deploys production from it). One logical change per PR.
- `frontend/.npmrc` `legacy-peer-deps=true` is load-bearing (React 19 peer ranges) — don't remove it.
- New remote image hosts go in `images.remotePatterns` in `frontend/next.config.ts`.
- Never add AI co-author trailers to commits.
