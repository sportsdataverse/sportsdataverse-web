## Summary
<!-- What changed and why. Link the issue if there is one. -->

## Checks
<!-- `cd frontend && npm run lint && npm run tsc` (and `npm run build` for config/route changes). -->

## Evidence
<!-- The pr-evidence workflow posts the four screenshots (desktop/mobile × light/dark) of this PR's
     Vercel preview and a Lighthouse comparison against the base as a comment, updated on every push.
     Pick the pages it measures (up to 4) with the line below; public (site) routes only.
     Fork PR, or nothing under frontend/? See CLAUDE.md "PR evidence". -->

Evidence routes: / /packages

## Checklist
- [ ] `npm run lint` and `npm run tsc` pass
- [ ] `Evidence routes:` names the pages this change affects most
- [ ] The pr-evidence comment is green, or every regression it flags is explained here
- [ ] _Or_ evidence not applicable: no `frontend/` change, or a fork PR with a locally shot screenshot matrix attached
