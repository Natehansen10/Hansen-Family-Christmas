# Build "Maison Noël": the Hansen family Christmas wishlist workshop

You are building a private, family-only Christmas wishlist web app for the Hansen family. It must feel like walking into a posh, cute Santa's workshop: a cinematic scroll-driven entrance, then a tap-around 3D workshop where each station is a feature. It also has to work flawlessly as a wishlist, because Mom and Dad (Jen and Curtis) will actually shop from it.

Repo: https://github.com/Natehansen10/Hansen-Family-Christmas (default branch `main`, deploys to Vercel). Build the app at the repo root; keep these design files in `design/`.

Read this whole file first. Then read the files in `design/`:
- `design/concepts/01-exterior.png`, `design/concepts/02-doors.png`, `design/concepts/03-interior.png`: approved concept art. Match this look.
- `design/reference/prototype.html`: a working single-file prototype of the design system, token claim ceremony, gift cards, detail sheet, spoiler-shield rules and springs. Reuse its tokens, motion values and logic. Do not ship it as-is.

Before writing code, reply with: (1) your build plan for Milestone 1, (2) the repo structure, (3) any questions. Then build Milestone 1.

---

## 1. Name

"Maison Noël" is French: *maison* = house (and, in couture, a house of craft, like Maison Dior), *Noël* = Christmas. Together: **the House of Christmas**. Everyone in the family must learn this without being told separately. It is revealed on the brass plaque above the doors (Frame 3), repeated in the logo tagline ("the house of Christmas") and in the footer/wax seal.

## 2. People, roles and the spoiler shield (non-negotiable)

| Person | Role | Notes |
|-|-|-|
| Jen, Curtis | santa (parents) | Have their own wishlists. See Santa's Ledger. |
| Lindsay, AJ, Nate, Lydia, Josh, Katie, Gabriel | kid (adult children) | Have wishlists. Buy gifts for Jen and Curtis. |
| Frankie, Bo | grandkid | Lists managed by Lindsay and AJ |
| Honey | grandkid | List managed by Nate and Lydia |

Rules:
1. **Nobody ever sees claim/bought status on their own list.** Not Jen, not Curtis, nobody.
2. **Kids never see status on any kid's or grandkid's list**, including the grandkids they manage.
3. **Kids can claim and mark bought on Jen's and Curtis's lists**, and see each other's claims there, so nobody double-buys for the parents.
4. **Jen and Curtis see status on every list except their own** (Jen sees claims on Curtis's list and vice versa).
5. Siblings do not claim gifts for each other. Grandkids never get a status view.
6. Only Jen and Curtis can claim/buy on kids' and grandkids' lists.
7. A person can edit their own list. Managers can edit their grandkid's list (Nate and Lydia for Honey, Lindsay and AJ for Frankie and Bo).

```ts
canSeeStatus(viewer, owner):
  if viewer == owner or viewer.role == 'grandkid': false
  if owner.role == 'santa': true          // kids + other parent coordinate on Jen/Curtis
  return viewer.role == 'santa'           // only parents see kids'/grandkids' status
canClaim = canSeeStatus
canEdit(viewer, owner) = viewer == owner or owner.managers.includes(viewer)
```

**Enforce on the server, not just the UI.** Claim data must never reach a device that is not allowed to see it (a curious kid with dev tools must find nothing). Write a unit test that checks every viewer x owner pair (12 x 12) and an integration test proving that the board API response for a kid contains zero claim fields for their own and siblings' lists.

## 3. Identity without a login screen

- No accounts, no email, no login screen.
- First visit: you claim a gold figurine and set a 4-digit **vault code**. That device remembers you (httpOnly signed cookie).
- New device: tap your figurine and enter your vault code. This closes the "pick someone else to peek" loophole.
- Grandkids have no code. Their figurine is claimed by a managing parent.
- A figurine can only be claimed once (DB unique constraint, so two people tapping at the same moment cannot both win). Everyone sees claimed figurines update live.
- "Switch person" lives in a small menu for shared devices.

## 4. Stack

- Vite + React + TypeScript + Tailwind v4 (Nate's usual stack). Deploy on Vercel.
- 3D: three.js + React Three Fiber + @react-three/drei + @react-three/postprocessing (bloom, vignette, subtle depth of field). gltfjsx for model components.
- Animation: GSAP + ScrollTrigger (entrance timeline), Lenis (smooth scroll), Motion (UI springs, layout, exit animations), canvas-confetti (custom candy-cane and snowflake shapes via `shapeFromPath`).
- Sound: use-sound (Howler). Off until the user taps the sound icon.
- Data: Supabase Postgres + Realtime. All writes and all claim reads go through Vercel API routes using the service-role key. The browser's anon key can read nothing sensitive (RLS deny on `claims`).
- Link previews: server route using `linkpeek` (or `open-graph-scraper`) with SSRF protection and a timeout, Microlink as a fallback, and a manual entry form when a store blocks scraping (Amazon often does).
- Do NOT use InstantDB (it is shutting down in 2027).

## 5. Design system (from the prototype)

- Palette: Midnight Spruce `#0B1510` canvas, Forest Velvet `#0A3A1D`, Oxblood `#5A0D12`, Burnished Gold `#BC9C5C` (hairlines, accents), Gold Hi `#EAD39A`, Ivory Vellum `#F3EDE1` text/cards.
- Type: Bodoni Moda (display, use `opsz` around 40 at large sizes so hairlines don't vanish), Crimson Pro italic (flourishes), Manrope (UI). Fluid sizes with `clamp()`. Display letter-spacing about -0.03em.
- One radius system, concentric: inner 12px, outer = inner + padding (28px), pills 999px.
- Layered soft shadows (4 stacked), film grain overlay (~7% opacity, animated in steps), frosted glass panels (`backdrop-filter: blur(28px) saturate(1.25)`), gold hairline borders.
- 8px spacing grid, generous whitespace.

### The four signature effects (restraint rule: do these 4 extremely well, add nothing gimmicky)
1. **Spring physics everywhere.** Interruptible, velocity-preserving springs for every hover, press, sheet, camera settle and figurine lift. Never linear motion. Use the spring solver approach from the prototype (stiffness ~170-300, damping ~14-24) or Motion springs.
2. **Scrollytelling entrance** (Frames 1 to 5 below), scrubbed by scroll.
3. **Shared-element transitions.** A gift box morphs into its detail sheet (View Transitions API for DOM, falling back to a Motion `layoutId`). A figurine flies from the case into the claim panel.
4. **Texture and depth.** Grain, glass, bloom on gold and candlelight, soft stacked shadows.

Supporting (quiet): Lenis smooth scroll, masked line-by-line text reveals, staggered entrances, microinteractions with haptics (`navigator.vibrate`) on claim/submit, skeletons plus optimistic UI, blur-up images.

Do not add: custom cursors, magnetic buttons, mesh gradients, autoplaying hero video, hide-on-scroll nav, or extra effects not listed here.

---

## 6. Act I: The Arrival (scroll-driven, about 700vh, pinned full-screen canvas)

One normalized `progress` value (0 to 1) from GSAP ScrollTrigger + Lenis, stored in a zustand store and read non-reactively inside `useFrame` (no 60fps React re-renders). The camera follows a Catmull-Rom curve built from Blender empties (`Cam_00..Cam_N` positions, `Look_00..Look_N` targets). Remap progress per segment with smoothstep so the camera dwells at key frames. Reference: Codrops "Building a Scroll-Driven 3D Gallery Using a Blender Camera Path with Three.js and GSAP" and "Animate a Camera Fly-through on Scroll Using Theatre.js and React Three Fiber".

UI chrome in Act I: only a "Scroll to enter" cue (fades out at 2% progress) and a small sound toggle bottom-right. No logo and **no text in the sky**.

**Frame 1: The Estate (progress 0 to 0.10)**
- Zoomed all the way out: Santa's workshop at night, cute and posh (see `design/concepts/01-exterior.png`). Pines frame both sides, a lantern-lined path leads to the red doors, the big tree is right of the doors, smoke rises from the chimneys.
- Snow is always falling, in 3 depth layers (instanced points or a GPU shader).
- **The windows are alive:** warm emissive windows with silhouettes of little elves running, carrying presents and waving. Use flipbook sprite-sheet textures on the window planes, with each window offset in time so it never looks synchronized. This is the signature cute detail.
- Lanterns flicker gently. The aurora from the concept art may stay as a faint, slow background element only.

**Frame 2: The Approach (0.10 to 0.38)**
- The camera glides up the path on a **slight curve to the right, passing the tree**, then squares up to the doors.
- Foreground pines slide out of frame and lantern posts pass by. Each lantern brightens (emissive ramp) as the camera passes. The snow gets closer and larger.

**Frame 3: The Doors (0.38 to 0.55, dwell)**
- The doors fill the frame (see `design/concepts/02-doors.png`): wreaths, brass ring handles, lanterns, warm light leaking through the seam and under the doors.
- The camera holds still while the brass plaque above the doors **engraves itself**: "MAISON NOËL" letter by letter with a gold shimmer sweep, then a smaller line "maison · house   Noël · Christmas", then "The House of Christmas". Render the text as a canvas texture on the `Plaque` mesh (do not overlay HTML).
- The seam light pulses softly and the brass rings glint. Small hint: "Keep scrolling".

**Frame 4: The Opening (0.55 to 0.80)**
- **Scroll opens the doors.** `Door_L` and `Door_R` rotate inward about their hinges to about 100 degrees, driven by eased progress. The wreaths sway on springs.
- Golden light floods out (bloom intensity and light-shaft ramp) and a gust of snow blows inside. The camera pushes through the threshold.
- Sound (if enabled): door creak, then sleigh bells and a warm musical swell.

**Frame 5: The Workshop (0.80 to 1.0)**
- Inside (see `design/concepts/03-interior.png`): red runner, walnut benches, the tree at the far end, chandeliers, gift balconies, and Santa's office window up on the balcony.
- The camera eases from slightly zoomed in back to the wide establishing shot.
- **Little elf characters walk around** (rigged, animated, see the asset contract): carrying gifts along paths, hammering at benches, waving at the camera.
- "Welcome in, Hansens." reveals word by word behind a mask, holds, and fades.
- At progress 1 the pin releases into Act II (Lenis stops page scrolling and the hub takes over).

Returning visitors (localStorage flag): skip Act I and land in the hub, with a small "Replay the entrance" link. `prefers-reduced-motion`: replace the camera flight with three cross-faded stills (exterior, doors with the engraved plaque, interior) and no confetti.

## 7. Act II: The Workshop hub (tap to travel)

**Frame 6: The Hub**
- The interior is a fixed, explorable scene. Four stations glow softly (pulsing gold ring hotspots with labels that reveal on hover/focus): **Token Case** (left), **Wish Desk** (right wrapping station), **Gallery** (gift balconies), **Santa's Office** (upstairs; padlock icon for non-parents).
- Tap a station: the camera flies there along a short spring-damped path (use drei `CameraControls` with a smooth time, or maath `damp3`), the background softens (depth-of-field or CSS backdrop blur), and a frosted glass panel springs up. The panel is draggable down to dismiss with velocity, and interruptible.
- Persistent chrome: top-left logo "Maison Noël / the house of Christmas", top-right your figurine plus "Switch person", bottom-right sound toggle.
- First-time visitors who have not claimed a figurine get a gentle glow plus a walking elf guiding them to the Token Case.
- Elves keep walking around the hub. Clicking an elf makes it wave (easter egg).

**Frame 7: Token Case (choose your piece)**
- The camera pushes into the velvet display case. **16 small gold figurines** stand on its shelves (list below).
- Hover/tap: the figurine lifts and turns on a spring under a spotlight. Claimed figurines are darker gold with "Reserved for <Name>" engraved on their plinth.
- Claim: pick who you are, set your vault code, then the figurine pops (spring overshoot), a candy-cane + snowflake confetti burst fires from it, a haptic tick plays, and the engraving reveals. The claim updates live for everyone.
- Figurines: Santa Claus, Mrs. Claus, The Head Elf, The Nutcracker, Sugar Plum Fairy, Ebenezer Scrooge, Tiny Tim, Gingerbread Man, Jack Frost, Krampus, Comet (reindeer), Toy Soldier, Rudolph, Frosty, The Grinch, Buddy the Elf. Private family use only. Design our own versions, never copy film art.

**Frame 8: Wish Desk (add a wish)**
- Paste a store link and the elves wrap it. Show a skeleton gift instantly (optimistic), unfurl the link server-side (title, image, price, store), and let the user edit everything before saving. Fields: link, title, price, store, priority (Must Have = gold ribbon, Would Love = oxblood ribbon, Stocking Stuffer = ivory ribbon), notes (size/color/model).
- On save: an elf wraps the box on the bench, the box **rides the brass conveyor** up to the owner's shelf on the balcony, and a snowflake burst fires when it lands. Managers see "Adding for Honey" etc.

**Frame 9: Gallery and Santa's Office**
- **Gallery:** a glass panel with a bento grid of everyone's shelves (layout and gift card design from the prototype), each headed by the person's figurine. Tap a gift and the box morphs into the detail sheet: big wrapped box, title, store, price, priority, notes, "Open at <Store>" (new tab), and claim actions only where `canClaim` allows ("I'll get this", "Mark as bought", "Let someone else get it"). Status pills only where `canSeeStatus` allows. When a status is hidden, show nothing at all (no placeholder that hints).
- **Santa's Office (Jen and Curtis only):** the padlocked door opens after their vault code. Inside is **Santa's Ledger**, a leather-bound, fast, plain table: every wish except their own, grouped by person or by store (a "shopping route"), with status (Claimed, Bought, Wrapped, Under the Tree), price, link, per-person spend totals, and print/CSV export. This is the most important screen to get right; it is purely functional, with no gimmicks.

## 8. Blender asset contract (so art and code can be built in parallel)

Nate can build or refine models in Blender (optionally driven from Claude Code via a Blender MCP server). Until real assets exist, **build blockout placeholders with identical node names** from primitives plus CC0 packs (Kenney Holiday Kit, KayKit Holiday Bits) so the final GLBs are a drop-in swap.

- Units are meters, Y-up glTF, transforms applied, Draco or meshopt compression, KTX2 textures, baked lighting (Cycles lightmaps) for static architecture.
- `public/models/exterior.glb`: `Workshop`, `Door_L` and `Door_R` (pivots on the hinges), `Plaque` (UV'd for the text texture), `Tree`, `Lantern_01..N` (emissive), `Window_01..N` (planes for elf flipbooks), `Pine_*`, `Cam_00..N` and `Look_00..N` empties for the approach path (curving right past the tree).
- `public/models/interior.glb`: architecture plus `Station_TokenCase`, `Station_WishDesk`, `Station_Gallery`, `Station_Office` empties, each with child `Cam` and `Target` empties; `Conveyor_00..N` empties; `ElfPath_A_00..N` (several paths); `Shelf_<personId>` empties for gift placement; `Case_Slot_01..16` for figurines.
- `public/models/elf.glb`: one rigged elf (Mixamo auto-rig is fine) with clips `Idle`, `Walk`, `Run`, `Carry`, `Hammer`, `Wave`. Instance it with `SkeletonUtils.clone` and vary hat/scarf colors in code. About 6 to 10 elves on screen.
- `public/models/figurines/<tokenId>.glb`: 16 files, about 3 to 6k triangles each, origin at base center, height 1 unit, no materials. Code applies one shared gold `MeshPhysicalMaterial` (metalness 1, roughness about 0.22, clearcoat, environment map) so all pieces read as one matched set.
- `public/sprites/elf-window-*.png`: flipbook sheets for window silhouettes.
- Budgets: Act I under 6 MB total over the wire, interior under 8 MB, lazy-load figurines. Show the concept art as an instant poster/LCP image with blur-up while the 3D loads (progress drives a subtle loader).

## 9. Data model (Supabase)

- `people(id, name, role enum[santa,kid,grandkid], vault_hash, created_at)` (seed all 12)
- `managers(person_id, manager_id)` (seed Honey: nate, lydia; Frankie and Bo: lindsay, aj)
- `tokens(id, name, model_path, owner_id unique null references people)` (seed all 16)
- `wishes(id, owner_id, added_by, url, title, image_url, image_blur, store, price_cents, priority, notes, sort, created_at, updated_at)`
- `claims(wish_id pk, claimer_id, status enum[claimed,bought,wrapped,under_tree], updated_at)`: RLS denies all client access and it is read only via the API.
- API routes: `POST /api/session` (claim figurine plus set code, or verify code), `GET /api/board` (wishes plus only the claim fields this viewer may see), `POST/PATCH/DELETE /api/wishes`, `POST /api/claims` (validates `canClaim`), `GET /api/ledger` (santas only), `POST /api/unfurl`.
- Realtime: subscribe to `tokens` and `wishes`. For claims, broadcast a payload-free "board changed" event and refetch `/api/board`, so no claim data travels over realtime.

## 10. Performance, accessibility and finish

- 60fps: animate only transform/opacity in the DOM; in WebGL, cap DPR at 1.5 on mobile and use drei `PerformanceMonitor` to drop bloom/DOF/elf count on weak devices.
- No layout shift, blur-up images, skeletons, optimistic UI everywhere.
- Mobile first: separate camera framings/FOV per aspect ratio (portrait phones are the main device). Touch targets of 44px or more. Haptics on claim, save and buy.
- `prefers-reduced-motion` fully respected. A "Quick mode" toggle gives a plain 2D list version with the same data (for grandparents and old phones).
- Keyboard and screen reader: every 3D hotspot has a DOM button equivalent.
- Custom 404 ("This elf took a wrong turn"), good empty states ("Your shelf is empty. The elves are waiting."), a favicon (the wax seal), and an OG image (the doors with the plaque).

## 11. Milestones and acceptance criteria

**Milestone 1: by Thanksgiving, Thursday Nov 26 (family claims figurines at dinner)**
- Everything functional: sessions plus vault codes, figurine claim (coin medallions from the prototype are an OK stand-in), wishes CRUD with unfurl, Gallery, detail sheet, claims, Santa's Ledger, the spoiler shield with tests, realtime, deployed on Vercel.
- Entrance as a **2.5D fallback** built from the concept art: layered parallax zoom on `design/concepts/01-exterior.png`, a cross-fade into `design/concepts/02-doors.png` with CSS-3D door panels and the plaque engraving, doors opening into `design/concepts/03-interior.png`. Hub = the interior image with the four hotspots. Same frame timings as Section 6.
- Acceptance: the 12 x 12 permission test passes; a kid's `/api/board` contains no claim data for their own or siblings' lists; Lighthouse mobile performance of 85 or more on the hub.

**Milestone 2: by about Dec 6 (the 3D workshop)**
- Swap in the R3F scenes (blockouts first, then Blender GLBs): camera path with the curve past the tree, scroll-opened doors, window elf flipbooks, walking elves, gold figurines in the Token Case, camera fly-to stations.

**Milestone 3: by about Dec 13 (delight and polish)**
- Conveyor ride, sound design, live presence (see who is in the workshop), easter eggs, OG/404/empty states, a performance pass, and reduced-motion and Quick mode QA.

Work in small PRs per milestone section. After each milestone, record a short screen capture or screenshots of every frame on desktop and on a 390px phone.
