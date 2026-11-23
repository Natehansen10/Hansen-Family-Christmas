# CLAUDE.md: Maison Noël (Hansen Family Christmas)

Start here: read `design/PROMPT.md` in full, plus `design/concepts/` and `design/reference/prototype.html`, before making changes.

## Hard rules
- **Spoiler shield is enforced server-side.** Nobody sees claim/bought status on their own list. Kids never see status on kids' or grandkids' lists. Kids may claim on Jen's and Curtis's lists. Jen and Curtis see status on every list except their own. Claim data must never be sent to a device that may not see it. Keep the 12 x 12 permission test passing.
- **No login screen.** Identity = claimed gold figurine + 4-digit vault code per device. Grandkids (Frankie, Bo, Honey) are managed by their parents.
- **Restraint.** Only the four signature effects (springs, scrollytelling entrance, shared-element transitions, texture/depth). No custom cursors, magnetic buttons, mesh gradients or extra gimmicks.
- Respect `prefers-reduced-motion`; keep Quick mode (plain 2D) working.
- Blender assets must follow the node-name contract in `design/PROMPT.md` section 8. Placeholders use the same names.
- Stack: Vite + React + TS + Tailwind v4, R3F/drei, GSAP + Lenis, Motion, Supabase via Vercel API routes. Do not use InstantDB.
