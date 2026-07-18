---
target: public site + platform chrome (frontend/app/(site))
total_score: 23
p0_count: 1
p1_count: 2
timestamp: 2026-07-18T08-46-09Z
slug: frontend-app-site
---
Method: dual-agent (A: design-review sub-agent · B: detector/evidence sub-agent)

# Design Health Score: 23/40 (Acceptable — strong chrome, legacy middle drags)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | /stats skeletons pulse forever on API failure |
| 2 | Match System / Real World | 3 | "Repositories Forked", "No added Python packages" |
| 3 | User Control and Freedom | 2 | Platform dead end on mobile; no escape from deep MDX |
| 4 | Consistency and Standards | 1 | Two design systems; Sarina in 8 headings; multi-h1 pages (4 on /, 5 on /stats, 0 on /packages) |
| 5 | Error Prevention | 2 | n/a notable |
| 6 | Recognition Rather Than Recall | 3 | /packages unlabeled second R grid |
| 7 | Flexibility and Efficiency | 2 | No public search/filter anywhere |
| 8 | Aesthetic and Minimalist Design | 2 | Template noise on middle pages |
| 9 | Error Recovery | 2 | Unknown status renders failure-red; infinite skeletons |
| 10 | Help and Documentation | 3 | No in-context help on platform jargon |
| **Total** | | **23/40** | |

# Anti-Patterns Verdict
LLM: chrome (home/about/blog/platform) reads authored; one click deep (= the primary CTA target /packages) falls into gradient-Sarina portfolio-template slop. Detector agrees exactly: 12 findings — gradient-text ×8 (PackagesClient 47/67/101, ManagePackages 35/125, ManageProjects 40/130, SignInGate 13), side-tab ×3 (Danger/Warning border-l-4, TOC border-l-2), broken-image ×1 (OgImage). False positives: SSR html lacking class="dark" (next-themes pre-paint script — expected); 30s TTFB on Mongo pages is the local stub URI, not prod.

# Priority Issues
- [P0] One site, two design systems — primary CTA lands in the old skin; port the about-header pattern to packages/projects/stats/snippets/gate; delete all gradient text/bars (incl. PageTop.tsx:31, PackageCard.tsx:11).
- [P1] Platform has no mobile navigation (sidebar hidden md:flex, ⌘K hidden) — add sheet drawer from GROUPS; unify PLATFORM_TABS/GROUPS drift.
- [P1] Light-mode AA failures: text-accent links 3.86:1; StatusBadge ~2:1 on /15 tints; /70 meta text 3.39:1. Fix with light-mode -ink variants (score-ink pattern exists).
- [P2] /packages IA: unlabeled duplicate R grid, broken empty-state copy, wrong alt, dead saturate-0.5 class; no search over 40+ packages.
- [P2] Home does four jobs; ends on a non-responsive boilerplate contact form (grid-cols-2 at 320px).
- [P3] Legacy hacks: .card mt-[30%], ml-[20%] centering, div-in-h1 skeleton, global overflow-x hidden; hr !important half-width.

# Broken/link evidence (B)
- External 404 on every page: saiemgilani.github.io/sportsdataverse-R/ (footer R docs). All other externals OK incl. Bluesky. Internal links: 0 broken (24 checked, all 18 posts 200).
- Heading hierarchy: exactly-one h1 only on /blog, /snippets, /privacy.

# Persona Red Flags
- Jordan: first click crosses the brand chasm; "Member sign in" occupies a hero slot aimed at first-timers.
- Casey: .card mt-[30%] canyons; contact grid-cols-2 at 320px; 10px hero chip text.
- Riley: no search; infinite skeletons on /stats; empty states without retry.
- Alex: platform unreachable nav on phones; crumb not a link; nav defined twice (widgets vs sidebar) already drifted.
- Sam: ticker aria-hidden hides the org's best numbers from screen readers; light StatusBadge invisible; multi-h1 outlines.

# Minor
Blog index third label idiom; unknown workflow status = red; /stats shows GitHub vanity not warehouse stats; R docs link off-brand + dead; stale repo CLAUDE.md (says Pages Router/Tailwind 3).

# Strengths
Token layer + documentation (AA-tuned core pairs, score/score-ink flip); the ticker signature (true facts, graceful fallback, motion-reduce); platform chrome tone (grouped sidebar, mono metadata, honest ops copy).

# Questions
1. Ticker is aria-hidden and /stats answers with GitHub followers — who is /stats for?
2. Is Sarina brand or unaudited inheritance?
3. Is the public site a packages funnel or a platform lobby? It's styled as the first, structured as the second.
