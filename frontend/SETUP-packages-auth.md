# Package self-service — setup

This feature lets members of the **`sportsdataverse`** GitHub organization add
and edit the package entries shown on `/packages`, via a protected on-site form
at **`/packages/manage`**. Authentication is GitHub OAuth (NextAuth); the trust
boundary is org membership — any active org member can add/edit/delete entries.

## How it works

- `pages/api/auth/[...nextauth].ts` + `lib/auth.ts` — NextAuth GitHub provider.
  On sign-in we call `GET /user/memberships/orgs/sportsdataverse` with the
  user's own `read:org` token; `state === "active"` ⇒ the session is marked
  `isOrgMember`. No separate server PAT is needed.
- `pages/api/packages.ts` — `GET` is public; `POST/PUT/DELETE` require an
  org-member session (`getServerSession`) and validate the body against
  `lib/packageSchema.ts` (zod). Server stamps `createdBy/updatedBy/updatedAt`;
  client-supplied `_id`/metadata are ignored.
- `pages/packages/manage.tsx` — the gated CMS UI (list + add/edit/delete).
- The `/packages` page renders live via `getServerSideProps`, so edits appear on
  the next load — no revalidation step.

## One-time setup

### 1. Register a GitHub OAuth App

<https://github.com/settings/developers> → **New OAuth App**

| Field | Value |
| --- | --- |
| Application name | SportsDataverse.org |
| Homepage URL | `https://sportsdataverse.org` |
| Authorization callback URL | `https://sportsdataverse.org/api/auth/callback/github` |

Add a second callback (or a second dev OAuth app) for local work:
`http://localhost:3000/api/auth/callback/github`.

Copy the **Client ID** and a generated **Client secret**.

> The requested scope (`read:user read:org`) is set in code; `read:org` is what
> lets us read the caller's org membership, including private memberships.

### 2. Set environment variables

Local (`.env.local`) and on Vercel:

```
GITHUB_ID=<oauth client id>
GITHUB_SECRET=<oauth client secret>
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://sportsdataverse.org   # http://localhost:3000 locally
```

`MONGODB_URI`, `DB_NAME`, `DEV_URL`, `PROD_URL` are unchanged. The legacy
`PACKAGES_SECRET` is no longer used and can be removed.

### 3. (Optional) backfill metadata

Existing `packages` documents predate the `createdBy/updatedBy/*At` fields.
Nothing breaks without them; they'll be populated the first time an entry is
edited through the UI.

## Notes / future work

- **Private vs. public membership:** members whose org membership is set to
  "private" are still recognized (the membership endpoint is called with the
  user's own token). If a member is denied, confirm their membership `state` is
  `active` (not `pending`).
- **Moderation:** entries publish immediately (org members are trusted). The
  `published` flag still exists, so an admin-only review queue can be layered on
  later without a schema change.
- **Auto-derive:** a future sync job could pre-fill versions / stars / downloads
  from the r-universe / PyPI / npm APIs so manual edits are rarely needed.
