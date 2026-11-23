# Maison Noël: the Hansen Family Christmas

*Maison Noël* is French for **the House of Christmas** (*maison* = house, *Noël* = Christmas).

A private Christmas wishlist workshop for the Hansen family. Walk up to Santa's workshop, scroll the doors open, claim your gold figurine, and leave your wishes with the elves. Jen and Curtis shop from Santa's Ledger, and nobody ever sees what's been bought for them.

## Design files
- `design/PROMPT.md`: full build spec (frames, rules, stack, asset contract, milestones)
- `design/concepts/`: approved concept art (exterior, doors, interior)
- `design/reference/prototype.html`: working prototype of the design system and interactions

## Run it locally
```bash
npm install
npm run dev
```
With no Supabase env vars, `npm run dev` uses an in-memory store (wiped on restart). Good for trying the flows.

```bash
npm test
```
Runs the 12 x 12 permission matrix, the API leak tests and the link-preview SSRF tests.

## Go live (one time)
1. Create a Supabase project. In the SQL editor, run `supabase/migrations/0001_init.sql`. It creates the tables, seeds the 12 people and 16 pieces, and turns on RLS with no policies, so the public key can read nothing.
2. In Vercel, add these env vars for Production and Preview (see `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SESSION_SECRET` (32+ random characters).
3. Deploy. Without step 2 the API answers 503 on purpose rather than pretending to save.

Forgot a vault code: in Supabase run `update people set vault_hash = null, failed_attempts = 0, locked_until = null where id = 'nate';`. The next code entered on that person's piece becomes the new one.

## How the spoiler shield is enforced
- `shared/permissions.ts` holds the rules. `server/views.ts` is the only place claim data is serialized, and it omits the `claim` key entirely for lists a viewer may not see.
- The browser never talks to the database. Realtime carries a payload-free "changed" ping; data always comes from `/api/board`.
- `tests/permissions.test.ts` checks all 144 viewer x owner pairs. `tests/api.test.ts` proves a kid's board is byte-identical whether or not a sibling's gift is claimed.

## Layout
- `api/index.ts`: the one Vercel function (`/api/*` is rewritten to it)
- `server/`: handlers, session cookie, vault codes, link previews, the Supabase and in-memory stores
- `shared/`: permissions, types, the family seed
- `src/arrival/`: Act I, the 2.5D entrance. `src/hub/`: Act II. `src/panels/`: Token Case, Wish Desk, Gallery, Santa's Office. `src/quick/`: Quick mode
- `design/captures/m1/`: Milestone 1 screenshots, desktop and 390px

## Milestones
1. Thanksgiving (Nov 26): fully working app with a 2.5D entrance built from the concept art
2. ~Dec 6: the 3D workshop (Blender models, scroll camera, walking elves, gold figurines)
3. ~Dec 13: delight and polish
