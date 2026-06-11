---
title: Superintendent v0.1 — Designer Brief (Hand-off Prompt)
date: 2026-05-28
status: ready to hand off
intended-recipient: any UI/UX designer agent (e.g., voltagent-core-dev:ui-designer, art:art-director, ui-ux:interface-artisan, or external)
companion-doc: ./2026-05-28-superintendent-v0.1-design.md
---

# How to use this document

Hand the contents below (everything under `--- BEGIN DESIGNER PROMPT ---`) to a UI/UX designer agent. The prompt is self-contained — the agent does not need access to the rest of the repo.

What you should get back:

1. A short brand expression — wordmark/logo concept, palette, type system, icon style direction.
2. Wireframes (text-based, ASCII, or Mermaid is fine; visual mockups better) for every screen listed below, in mobile and desktop variants.
3. State variants per screen: loading, empty, error, success.
4. A component inventory mapped to shadcn primitives where possible (so we know what's vanilla shadcn vs. custom).
5. Notes on interactions that are non-obvious (zone drawing tool, layer panel toggling, upload progress).
6. Anything the designer pushes back on or wants to challenge in the brief.

When the designer returns, paste their response back into the same conversation with me and we'll review it together against the engineering spec, then proceed to writing the implementation plan.

---

--- BEGIN DESIGNER PROMPT ---

# Superintendent v0.1 — UI/UX Design Brief

You are designing the v0.1 interface of **Superintendent**, a personal-then-eventually-commercial software platform for managing low-input, native-ecology golf courses. v0.1 is much smaller than the eventual platform — it's a single-user web tool the developer will dogfood on his home garden in Oklahoma City. The same product will grow over ~10 years into a multi-tenant platform handling tee times, members, revenue, inventory, staff scheduling, sensor telemetry, drone imagery, irrigation automation, and conservation reporting.

**Design v0.1, but do not paint v0.1 into a corner.** Your visual language and component system should scale to the larger product without rework.

## 1. Product context (read this carefully before designing)

### Who this is for
- v0.1 user: a solo developer with a CS background, building this for himself in his off-hours. He flies a DJI Flip drone (RGB camera) over his garden every couple of weeks and wants to see vegetation health per zone over time.
- Long-term user: the superintendent of a small (~9–18 hole) owner-operated golf course that manages turf using native grass species without synthetic chemicals or fertilizers. Field-based, often on a phone or tablet outdoors, hands sometimes muddy or gloved.

### What v0.1 does
A web app where the user can:
1. Define spatial zones on a basemap of his garden (raised beds, lawn, native border, paths).
2. After flying his drone, upload the orthomosaic GeoTIFF.
3. View RGB vegetation index overlays (VARI, GLI, ExG) on the map, one index at a time, with the zones outlined.
4. See per-zone aggregate stats (mean, min, max, std-dev) for each index for each flight.
5. See a time-series chart of a zone's index values across the history of flights.

### What v0.1 does NOT do (but the product eventually will, don't paint into a corner)
- Tee time booking, member management, revenue tracking, inventory, staff scheduling
- Real-time sensor dashboards (soil moisture, temperature, weather)
- Irrigation control (turn valves on/off)
- Phenology-aware scheduling (calendar of mow/seed/burn windows)
- Conservation reporting exports (USDA NRCS, CRP, Audubon)
- Multi-tenant / multi-course

### Technical context (so you design within real constraints)
- React SPA (Vite + TypeScript + Tailwind 4 + **shadcn/ui** as the component primitive layer)
- MapLibre GL JS for the map; PMTiles for raster overlays; **terra-draw** for the polygon editor
- Recharts for time-series
- Mobile-first responsive (the developer wants to use it on his phone in the garden)
- Single user in v0.1 (Supabase Auth magic-link), but show the user identity in the UI as if it could be multi-user later

## 2. Brand direction (give us a position, not a logo competition)

Superintendent's brand should communicate:

- **Quiet competence over slickness.** This is for working people who manage living systems, not for a marketing pitch. Think USGS / field-guide / professional naturalist, not SaaS dashboard.
- **Native ecology, not greenwashing.** Earthy palette is appropriate, but avoid stereotypical "eco" tropes (leaf logos, all-green palette, sans-serif rounded happy fonts). The user community has strong opinions about the difference between real conservation and marketing language.
- **Trustworthy with data over time.** This app accumulates records the user will rely on for years (eventually for government conservation reports). The visual language should feel durable and archival, not trendy.
- **Outdoor-readable.** High contrast, large legible type, color choices that survive on a phone screen in bright sun.

Give us:
- A wordmark concept for "Superintendent" (or a variant — feel free to push back on the name if you think it's wrong).
- A 5–7 color palette: ink, paper, two earth tones, one accent for affirmative actions, one for warnings/errors, with hex values and rationale.
- A type pairing (one display + one body, both with strong outdoor readability).
- An icon system recommendation (Phosphor, Lucide, or custom).
- A pattern or texture motif if you think it adds something — but only if it earns its keep. Negative space is fine.

## 3. Screens to design

For each screen, deliver:
- Mobile and desktop wireframes.
- State variants: loading, empty (no data yet), error, success/populated.
- Notes on interactions where the answer isn't obvious.

### S1 — Auth / sign in
- Magic link via email. Single field, large submit button, friendly copy.
- "Check your email" confirmation state.

### S2 — App shell
- Header with logo, current parcel name (single parcel in v0.1, but design as if selectable), user avatar/menu.
- Primary navigation: Map (default), Flights, Zones, Settings. Mobile: bottom tab bar or hamburger drawer — your call with rationale.
- Don't design Settings beyond "Sign out" and "Account" for v0.1.

### S3 — Main map view (the most important screen)
Layout (desktop):
- Left or right side panel (collapsible): zone list, flight selector, layer controls.
- Main canvas: MapLibre map.
- Top-of-map floating controls: index selector (Ortho / VARI / GLI / ExG), opacity slider, basemap toggle.
- Bottom-of-map floating "Upload flight" CTA.
- Map controls: zoom, geolocate, drawing toolbar (draw polygon, edit polygon, delete polygon).

Layout (mobile):
- Full-screen map.
- Bottom sheet drawer (drag handle) containing zone list and layer controls.
- Floating action button for "Upload flight."
- Drawing tools collapse into a single overflow button.

Interactions to specify:
- How a user enters "draw zone" mode, completes a polygon, and saves it.
- How a user selects a layer and adjusts opacity without obscuring the map.
- How a user switches between the latest flight and a historical flight.
- What the legend looks like for each index (VARI ranges roughly −1 to +1; design a color ramp that's accessible for color-blind users).

### S4 — Flights list
- Card or row list of flights, newest first.
- Each shows: thumbnail (if available), flown_at date, status (uploading, ingesting, ready, failed), drone model, weather notes.
- Empty state: "No flights yet. Upload your first one to see vegetation indices."
- Tap a flight → goes to flight detail.

### S5 — Flight detail
- Header: date, status, drone, weather.
- Per-zone aggregate table: zone name | mean VARI | mean GLI | mean ExG | std-dev | change vs previous flight.
- Sortable columns.
- Action: "View on map" → S3 with this flight selected.
- Failed-state design: error message, "retry ingest" action.

### S6 — Zone detail
- Header: zone name, kind (bed/lawn/path/native/other), area (sq ft and sq m).
- Time-series chart: x-axis flights chronologically, y-axis selected index, lines for VARI/GLI/ExG with the user able to toggle which lines show.
- Below chart: table of flights with that zone's aggregates.
- Action: "Edit zone" → opens draw editor on the map (S3).

### S7 — Upload flight wizard (modal or dedicated screen)
Three steps:
1. **Select file:** drag/drop GeoTIFF or browse. Show file name + size + a sanity check (is this a valid GeoTIFF?).
2. **Metadata:** flown_at datetime picker (default now), drone model dropdown (default "DJI Flip"), weather notes textarea.
3. **Upload & ingest:** progress bar for upload, then a separate progress indicator for "Processing on server…" (which is the GDAL/Rust subprocess running). Final state: "Done. View on map →" or "Failed: [error message]. Retry."

Cover the in-between states; upload is the most failure-prone interaction in v0.1 (large files, slow connections, server processing).

### S8 — Empty & onboarding states
First-time user with no parcel and no zones drawn:
- A guided empty state on S3 walking through (1) draw your first zone, (2) upload your first flight.
- Don't make this a separate tutorial; integrate into the main map view.

## 4. Specific design challenges to solve

These are the parts of v0.1 most likely to be UX dead ends if not designed deliberately:

1. **The layer/index switching control on mobile.** Index switching has to be one-handed-while-standing-in-a-garden easy. Not a hidden menu. Not three taps deep.
2. **The drawing tool affordance.** Most users have never used a polygon editor. The "draw zone" interaction needs onboarding without being a wall of tooltips.
3. **The colormap for vegetation indices.** VARI ranges roughly −1 to +1. Conventionally a red-yellow-green ramp, but red-green ramps fail color-blind users. Propose a colormap that works for deuteranopia and protanopia and explain your choice.
4. **The "your flight is processing" wait.** The server-side ingest can take 30s–5min depending on ortho size. The user needs to know whether to wait, switch tabs, or come back. Design the trust here.
5. **Negative space and information density.** The eventual platform has many screens (sensors, irrigation, tee times). The design system should feel comfortable becoming dense without ever feeling cluttered now.

## 5. What we are NOT asking you to do

- Marketing site, landing page, store presence.
- Animation prototypes.
- Pixel-perfect Figma files (text/diagram wireframes are fine; visual mockups better).
- The implementation. We have an engineering spec for that — your job is the design layer.
- Designing the deferred features (sensors, irrigation, tee times). Reference them only to make sure the v0.1 design doesn't preclude them.

## 6. Push back if any of these are wrong

- The name "Superintendent" — too long? Too narrow? Suggest alternatives if you think so.
- The brand direction in §2 — if "field-guide / archival" is wrong for the actual audience, say so and propose better.
- The screen list in §3 — if you think a screen is missing or doesn't earn its place, argue for the change.
- Any specific instruction in this brief that you think undermines the product. We want pushback; this brief was written by an engineering eye, not a design eye.

## 7. Output format

Deliver in this order:
1. **Brand expression** — wordmark, palette, type, icon recommendation, with rationale (≈ 300 words + visuals).
2. **Component inventory** — list of every distinct UI component you'll use, mapped to shadcn primitives where possible.
3. **Per-screen designs** — for each of S1–S8: wireframes (mobile + desktop), state variants, interaction notes.
4. **Design system tokens** — color (hex), spacing scale, type scale, radius, shadow, motion. Suitable for paste into Tailwind config.
5. **Concerns & pushback** — anything in this brief you'd change, anything you flagged as a UX dead-end, anything the developer should validate with real users before locking it in.

Lead with brand and tokens; finish with concerns. Keep it tight — quality over volume.

--- END DESIGNER PROMPT ---
