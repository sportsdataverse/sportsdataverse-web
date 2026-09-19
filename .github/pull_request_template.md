## Summary
<!-- What changed and why. Link the issue if there is one. -->

## Checks
<!-- `cd frontend && npm run lint && npm run tsc` (and `npm run build` for config/route changes). -->

## Evidence
<!-- The pr-evidence workflow posts the four screenshots (desktop/mobile × light/dark) of this PR's
     Vercel preview, a walkthrough clip per route, and a Lighthouse comparison against the base as a
     comment, updated on every push. Pick the pages (up to 4) with the first line; public (site) routes
     only. Name committed scripts/walkthroughs/*.mjs flows (up to 4) with the second line when the PR
     adds or alters an interaction. Fork PR, or nothing under frontend/? See CLAUDE.md "PR evidence". -->

Evidence routes: / /packages
Walkthrough steps:

## Walkthrough
<!-- Only for a clip the workflow cannot record (fork PR, or a flow behind /platform auth): drag the
     mp4/webm from a local `npm run walkthrough` here. Otherwise write "see evidence comment". -->

## Checklist
- [ ] `npm run lint` and `npm run tsc` pass
- [ ] `Evidence routes:` names the pages this change affects most
- [ ] The pr-evidence comment is green, or every regression it flags is explained here
- [ ] The evidence comment links a walkthrough clip for every affected route/flow (`Walkthrough steps:` names any new interaction), or one is attached above
- [ ] _Or_ evidence not applicable: no `frontend/` change, or a fork PR with a locally shot screenshot matrix attached
