---
title: Superintendent v0.1 — Design Response (interface-artisan)
date: 2026-05-28
agent: ui-ux:interface-artisan
prompt-source: ./2026-05-28-designer-brief.md
status: received, text-only (no rendered visuals)
---

# Superintendent v0.1 — Design Delivery (interface-artisan)

*Full response from the `ui-ux:interface-artisan` agent. Companion file: `2026-05-28-design-response-voltagent-ui-designer.md`.*

---

## 1. Brand Expression

### Position

**A field journal that happens to be software.** Not a dashboard. Not a SaaS product trying to look like a dashboard. The closest visual analogues are USGS topographic maps, Stokes field guides, Sibley bird guides, and the Soil Survey reports the USDA has been publishing since 1899. The work being done here — observing a living parcel over years, recording it carefully — is older than software, and the interface should honor that lineage.

### Wordmark concept

**Superintendent** set in a transitional serif (Source Serif 4, semibold, slightly tightened tracking) with a thin horizontal rule beneath, reminiscent of a USGS map title block. The wordmark sits comfortably above a small parcel name in monospace, like a field notebook cover ("Superintendent / OKC HOME / Plot 1").

**On the name:** considered pushing back. "Superintendent" is long (14 characters) and the golf-course meaning isn't universal — but it's the right name. It earns its length the same way "Superintendent of Schools" does: by carrying the weight of stewardship. The job title predates golf; it implies someone responsible for the whole system. Keep it. For tight spaces (favicon, mobile header collapse, future mobile app icon), use the monogram **St** in the same serif. Avoid "Super" as a nickname — it sounds like a discount supermarket.

### Palette

| Token | Hex | Role |
|---|---|---|
| `ink` | `#1B1F1A` | Body text, primary strokes. Near-black with a green undertone, like wet ink on field paper. |
| `paper` | `#F5F1E8` | App background. Warm off-white, like aged map paper. Survives bright-sun glare better than pure white. |
| `paper-2` | `#EBE5D4` | Cards, panels, secondary surfaces. |
| `soil` | `#6B4E2E` | Earth tone 1. Used for zone outlines, secondary headings, the wordmark rule. |
| `lichen` | `#5B6B3F` | Earth tone 2. Muted olive-green. Used sparingly for tags, native-vegetation zone fills. |
| `survey` | `#1E5A8C` | Accent / affirmative. A muted USGS blue, not Material blue. Used for primary buttons, selected states, links. |
| `iron` | `#A8392C` | Warning / error / destructive. Oxidized red, not fire-engine red. |

Rationale: this palette is **derivative of paper documents, not screens**. Pure white is rare in nature and rare on field paper. Greens are restrained because the data itself will introduce a lot of green via the index overlays — the chrome should not compete. Survey-blue as the accent is the deliberate move: it signals "civic, durable, archival" instead of "tech startup." Iron-red feels like rust, not danger.

### Typography

- **Display / headings:** Source Serif 4 (semibold for H1/H2, regular for H3). Open-source, designed by Frank Grießhammer at Adobe, generous x-height, excellent at small sizes. Reads as authoritative without being stiff.
- **Body / UI:** Inter (regular and medium). The workhorse. Optimized for screens, ships with tabular-figures (essential for the per-zone aggregate tables), wide language coverage for eventual localization.
- **Monospace / data:** JetBrains Mono. For coordinates, file names, timestamps, hashes, raw values. Reinforces the "this is a record" feeling.

All three are free and self-hostable. Outdoor readability comes from weight choices (avoid regular weights for anything under 14px), generous line-height (1.5 minimum for body), and the warm paper background (less glare than pure white).

### Icons

**Phosphor Icons (regular weight).** Lucide is the safe choice but its strokes are slightly thin for outdoor use; Phosphor's regular weight (1.5px stroke) reads cleaner on a sun-washed phone. Phosphor also has the breadth Superintendent will need as it grows (drone, plant, faucet, gauge, calendar — all there). Use the `regular` weight as default, `bold` for selected states. **Never the `fill` style** — it competes with the index overlays.

### Pattern / texture

**One restrained motif:** a 1px hairline grid (8px x 8px) at 4% opacity on `paper`, visible only on empty states and the auth screen. It evokes survey paper without being a gimmick. Skip it on data-dense screens. No noise textures, no paper-grain SVGs — those age badly and add weight.

---

## 2. Component Inventory

Mapped to shadcn/ui primitives. Anything marked **custom** is a Superintendent-specific composition built on shadcn primitives.

| Component | Built on | Notes |
|---|---|---|
| Button (primary/secondary/ghost/destructive) | `button` | Add a `field` size variant (52px tall, for muddy thumbs) |
| Input, Textarea | `input`, `textarea` | Use 16px minimum font-size to suppress iOS zoom |
| Select, Combobox | `select`, `command` | Combobox for drone model (extensible list) |
| Dialog (modal) | `dialog` | Used for Upload wizard on desktop |
| Sheet (bottom drawer) | `sheet` | Used for mobile zone list, mobile upload wizard |
| Drawer with drag handle | `drawer` (Vaul) | Mobile map bottom-sheet. Snap points: peek (15%), half (50%), full (90%) |
| Tabs | `tabs` | Index selector chip group, wizard step indicator |
| Toggle group | `toggle-group` | Index selector (Ortho/VARI/GLI/ExG) |
| Slider | `slider` | Opacity. Custom track styling — thicker than default |
| Card | `card` | Flight list rows, zone summary cards |
| Table, sortable | `table` | Per-zone aggregate tables. Tabular figures, sticky header on mobile |
| Avatar, Dropdown menu | `avatar`, `dropdown-menu` | Header user menu |
| Toast | `sonner` | Save confirmations, ingest completion notifications |
| Tooltip | `tooltip` | Desktop-only; on mobile, use inline labels |
| Progress | `progress` | Two distinct styles: determinate (upload), indeterminate (server processing) |
| Skeleton | `skeleton` | Loading states for cards, tables, charts |
| Alert | `alert` | Failed-ingest banners, GeoTIFF validation errors |
| Badge | `badge` | Flight status pills, zone-kind tags |
| Empty state | **custom** | Illustrated + actionable. See S8 |
| **MapCanvas** | **custom** | MapLibre wrapper |
| **LegendStrip** | **custom** | Index colorramp + numeric scale. Floating, dismissable |
| **IndexSelector** | **custom on `toggle-group`** | Persistent floating control. See S3 |
| **DrawingToolbar** | **custom on `toggle-group`** | Polygon draw/edit/delete states |
| **FlightSelector** | **custom on `popover` + `command`** | Date-pinned flight picker |
| **ZoneListItem** | **custom on `card`** | Color-swatch + name + area + chevron |
| **TimeSeriesChart** | **custom on Recharts** | Multi-line with toggleable series |
| **AggregateTable** | **custom on `table`** | With sparkline deltas |
| **UploadDropzone** | **custom on `input[type=file]`** | Drag-drop + validation feedback |
| **IngestProgressCard** | **custom** | Two-phase: upload determinate → processing indeterminate. See §4 challenge 4 |
| **WordmarkLockup** | **custom** | Wordmark + parcel name combo |

---

## 3. Per-Screen Designs

Wireframes are ASCII because they communicate structure faster than mockup files and survive PR review.

### S1 — Auth / Sign in

**Desktop (centered, ~440px wide on `paper` background with hairline grid):**

```
                  Superintendent
                  ──────────────

                  A field record for the
                  land you tend.

                  [ Email address                    ]

                  [        Send me a link        ]

                  No password. We'll email you a
                  one-time sign-in link.
```

**Mobile:** identical, full-width with 24px gutters, vertically centered.

**State variants:**
- **Default:** as above.
- **Submitting:** button collapses to spinner + "Sending…", input disabled.
- **Sent (success):** form replaced with `Check your email. We sent a sign-in link to cner@example.com. It expires in 15 minutes.` + small `Use a different email` ghost button.
- **Error:** Alert above form: `That email looks malformed. Try again.` (Iron-red border, no shake animation — it's condescending.)
- **Rate-limited:** `Too many attempts. Try again in 2 minutes.`

**Notes:**
- The serif wordmark + thin rule is the only branding. No hero image. No "features."
- Copy is direct. "Send me a link" not "Continue" — tells the user exactly what happens.

---

### S2 — App Shell

**Desktop header (64px tall, `paper-2` background, 1px `ink/8` bottom border):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Superintendent  /  OKC HOME  ⌄          [Map] Flights Zones    (CS) │
│ ────────────                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

- Left: wordmark + parcel selector (dropdown chevron even with one parcel — establishes the affordance for multi-parcel later).
- Center: primary nav. Active tab gets `survey` underline (2px, 4px below baseline) — not a pill, not a background fill. Field-guide tab markers.
- Right: avatar (initials on `lichen` fill) → dropdown: Account, Sign out.

**Mobile header (56px) + bottom tab bar (64px, safe-area inset):**

```
┌─────────────────────────────────┐
│ St / OKC HOME ⌄           (CS) │
├─────────────────────────────────┤
│                                 │
│         [screen content]        │
│                                 │
├─────────────────────────────────┤
│   🗺 Map   ✈ Flights   ▢ Zones  │
└─────────────────────────────────┘
```

**Bottom tab bar over hamburger drawer, with rationale:** the user will switch between Map and Flights constantly while in the garden ("did this beet bed look this bad last flight?"). A hamburger forces two taps per switch and hides the IA. Bottom tabs cost ~64px of vertical space, which the map can claim back by collapsing the tab bar on scroll (a common pattern). Settings lives behind the avatar — it's a once-a-month destination.

Icons: Phosphor `MapTrifold`, `Drone`, `Polygon`. Labels stay visible (no icon-only) — outdoor users with sunglasses need both signals.

---

### S3 — Main Map View (the critical screen)

**Desktop (1440px reference):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [HEADER: Superintendent / OKC HOME ⌄    Map Flights Zones        (CS)] │
├──────────────┬──────────────────────────────────────────────────────────┤
│              │ ┌────────────────────────────────────────────────────┐   │
│ ZONES   (+)  │ │ Ortho · VARI · GLI · ExG       Opacity ●━━━━○  ⊟ │   │
│              │ └────────────────────────────────────────────────────┘   │
│ ■ Raised Bed │                                                          │
│   312 sq ft  │                                                          │
│              │                                                          │
│ ■ Lawn       │            [  MAP CANVAS — MapLibre  ]                   │
│   1,840 sq ft│                                                          │
│              │                  zones outlined in `soil`                │
│ ■ Native Brdr│                  selected zone outlined in `survey`      │
│   620 sq ft  │                                                          │
│              │                                                          │
│ ■ Path       │   ┌──────────────┐                       ┌───┐           │
│   90 sq ft   │   │ VARI         │                       │ + │           │
│              │   │ −1 ▬▬▬▬▬▬ +1 │                       │ − │           │
│ ─────────────│   └──────────────┘                       │ ⌖ │           │
│ FLIGHT       │                                          └───┘           │
│              │                                                          │
│ May 24, 2026 │   ┌───┬───┬───┐                                          │
│ DJI Flip  ⌄  │   │ ▱ │ ✎ │ ⊘ │                  [ ⬆ Upload flight ]    │
│              │   └───┴───┴───┘                                          │
├──────────────┴──────────────────────────────────────────────────────────┤
```

- **Left panel (320px, collapsible to 0):** Zones list (color swatch + name + area; tap selects). Flight selector at the bottom (current flight + date + dropdown to switch).
- **Top floating control bar:** index selector (toggle group, 4 options), opacity slider, basemap toggle (`⊟` icon, satellite ↔ blank).
- **Bottom-left:** Legend strip for the current index. Always visible when an index is active. Dismissable (collapses to a small chip).
- **Bottom-center:** Drawing toolbar (draw polygon, edit existing, delete).
- **Bottom-right:** Map controls (zoom +/−, geolocate).
- **Bottom-right floating CTA:** Upload flight (primary button, `survey`).

**Mobile:**

```
┌───────────────────────────────┐
│ St / OKC HOME ⌄         (CS) │
├───────────────────────────────┤
│ ┌───────────────────────────┐ │
│ │Ortho VARI GLI ExG    ●━━○│ │
│ └───────────────────────────┘ │
│                               │
│                               │
│       [ MAP CANVAS ]          │
│                               │
│                               │
│  ┌─────────────┐              │
│  │ VARI −1 +1  │       (+)   │
│  └─────────────┘       (−)   │
│                        (⌖)   │
│                               │
│  ┌─────────┐    ┌──────────┐ │
│  │  ✎ ⋯    │    │ ⬆ Upload │ │
│  └─────────┘    └──────────┘ │
├───────────────────────────────┤
│ ━━━ Zones · May 24 flight ━━━ │ ← drag handle peek
├───────────────────────────────┤
│  🗺 Map   ✈ Flights   ▢ Zones │
└───────────────────────────────┘
```

- **Persistent top control:** index selector + opacity. This is the answer to challenge §4.1. It is **never** hidden behind a menu. It sits across the top, costs ~56px, and is one thumb-tap away regardless of scroll position.
- **Bottom sheet (Vaul drawer):** peek state shows the current flight date and a drag handle. Half-snap reveals the zone list. Full-snap reveals zone list + flight history.
- **Drawing tools:** collapsed to a single pencil button. Tapping expands to draw/edit/delete inline (animated chip group). Long-press the pencil shows quick tutorial overlay.
- **Upload FAB:** bottom right, 56px circular, `survey` fill, `Drone + Upload` icon.

**State variants:**
- **Loading map tiles:** map shows a soft `paper-2` color with the hairline grid until tiles load. No spinner — the grid signals "this is a survey, the page is yours."
- **No zones drawn yet:** see S8 onboarding overlay.
- **No flights uploaded:** index selector shows only Ortho. VARI/GLI/ExG buttons are present but disabled with a tooltip: "Upload a flight to see vegetation indices."
- **Ingest in progress for selected flight:** banner above legend: `Processing May 24 flight… (~2 min remaining)` with a small spinner. User can still interact with the map.
- **Failed ingest for selected flight:** banner: `May 24 flight failed to process. [View error] [Retry]` (iron-red border).

**Interaction notes:**

*Draw a zone:*
1. Tap pencil icon (drawing toolbar) → toolbar expands to show three modes.
2. Tap "Draw polygon" → cursor changes, top bar swaps to instructions: `Tap to add points. Double-tap to finish.` (mobile) or `Click to add points. Press Enter or double-click to finish.` (desktop). A dismiss-X is present.
3. After finishing the polygon, a bottom sheet (mobile) or popover (desktop) prompts: zone name (text), kind (select: Raised Bed, Lawn, Native Border, Path, Other), Save / Cancel.
4. On save: toast `Raised Bed saved · 312 sq ft`, zone appears in the list.

*Switch flights:*
- Desktop: flight selector dropdown in the left panel. Shows date + drone + thumbnail.
- Mobile: open bottom sheet, scroll to flight history section, tap a flight.

*Legend design (challenge §4.3):*
- Color-blind-safe ramp using a **diverging viridis-inspired scheme**: dark purple → magenta → tan → yellow-green → dark green. Specifically, the **Cividis** colormap for sequential indices (GLI, ExG which are mostly positive) and a custom **purple-tan-green** diverging ramp for VARI (which is signed −1 to +1, with 0 as the meaningful midpoint).
  - VARI ramp: `#3B2C4D` (deep purple, −1) → `#9B7AA3` → `#D9C9B0` (tan, 0) → `#7A9B5C` → `#2D4A1E` (deep green, +1).
  - This avoids the red-green confusion of conventional vegetation ramps. Tested against Coblis simulation: the purple and green endpoints remain distinguishable because they differ in luminance, not just hue.
  - The tan midpoint is also intentional — it reads as "neutral / bare soil" intuitively, which matches the VARI=0 meaning of "no vegetation signal."
- Legend shows: color ramp bar (200px wide), numeric ticks at −1, −0.5, 0, +0.5, +1, and the index name + brief explanation ("Visible Atmospherically Resistant Index — higher = healthier green vegetation").
- Tappable for an expanded explanation modal — supports user trust over time.

---

### S4 — Flights List

**Desktop:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Flights                                              [ ⬆ Upload flight ]│
├──────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ [thumb] May 24, 2026 · 2:14 PM                       ● Ready  │   │
│ │         DJI Flip · Clear, 78°F, light breeze                  │   │
│ │         4 zones · mean VARI 0.31 (+0.04 vs prev)              │   │
│ └────────────────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ [thumb] May 10, 2026 · 11:02 AM                     ● Ready  │   │
│ │         DJI Flip · Partly cloudy                              │   │
│ └────────────────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ [thumb] Apr 26, 2026 · 3:40 PM                  ◐ Processing  │   │
│ │         DJI Flip · — · Est. 1 min remaining                   │   │
│ └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

Status pills (Badges):
- `Ready` — lichen-green dot
- `Processing` — survey-blue spinning half-circle
- `Uploading` — survey-blue progress arc
- `Failed` — iron-red dot

**Mobile:** same cards, full-width, single column.

**State variants:**
- **Empty:** illustration (simple line drawing of a drone in flight on the hairline grid) + `No flights yet. Upload your first one to see vegetation indices.` + primary `Upload flight` button.
- **Failed flight:** card has iron-red left border (4px), shows error excerpt + `[ Retry ingest ]` ghost button inline.

---

### S5 — Flight Detail

**Desktop:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Flights                                                            │
│                                                                      │
│ May 24, 2026 · 2:14 PM                                ● Ready        │
│ DJI Flip · Clear, 78°F, light breeze                                 │
│                                              [ View on map → ]       │
│                                                                      │
│ ──────────────────────────────────────────────────────────────────── │
│                                                                      │
│ Per-zone aggregates                                                  │
│                                                                      │
│ Zone           ↕ │ Mean VARI │ Mean GLI │ Mean ExG │ Std │ Δ vs prev │
│ ────────────────┼───────────┼──────────┼──────────┼─────┼────────── │
│ Raised Bed       │  0.42     │  0.38    │  0.51    │ .08 │ +0.04 ▲   │
│ Lawn             │  0.28     │  0.31    │  0.39    │ .12 │ −0.02 ▼   │
│ Native Border    │  0.35     │  0.34    │  0.44    │ .15 │ +0.01 –   │
│ Path             │  0.04     │  0.06    │  0.09    │ .03 │  0.00 –   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- Tabular figures throughout. Δ column uses `lichen` for positive vegetation gain, `iron` for loss, `ink/60` for negligible (<0.005).
- Sort by clicking any column header.
- Row click → opens that zone in S6.

**Mobile:** table becomes a stacked card list per zone with the same data, scroll-snapping vertically.

**Failed state:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ May 24, 2026 · 2:14 PM                              ● Failed        │
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ ⚠ Ingest failed: GeoTIFF is missing geographic projection.    │   │
│ │   Re-export from your photogrammetry software with a CRS set. │   │
│ │   (Common: EPSG:4326 or your local UTM zone.)                 │   │
│ │                                                                │   │
│ │   [ Retry ingest ]  [ Replace file ]  [ Delete flight ]       │   │
│ └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

Error messages are **specific and educational**, not generic.

---

### S6 — Zone Detail

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Zones                                                              │
│                                                                      │
│ ■ Raised Bed                                            [ Edit zone ]│
│ Raised Bed · 312 sq ft (29.0 m²)                                     │
│                                                                      │
│ ──────────────────────────────────────────────────────────────────── │
│                                                                      │
│ Index over time          ☑ VARI   ☑ GLI   ☐ ExG                      │
│                                                                      │
│  0.6 ┤                                                               │
│      │                                                               │
│  0.4 ┤        ●━━━●                                                  │
│      │   ●━━━╱     ╲━━━●━━━━●  ← VARI                                │
│  0.2 ┤  ╱                                                            │
│      │ ●━━━━●━━━●━━━━●━━━━●━━━●  ← GLI                                │
│  0.0 ┤                                                               │
│      └──┬────┬────┬────┬────┬────┬─────                              │
│       Jan  Feb  Mar  Apr  May                                        │
│                                                                      │
│ ──────────────────────────────────────────────────────────────────── │
│                                                                      │
│ Flight history                                                       │
│ Date         │ VARI │ GLI  │ ExG  │ Std  │                           │
│ May 24, 2026 │ 0.42 │ 0.38 │ 0.51 │ 0.08 │                           │
│ May 10, 2026 │ 0.38 │ 0.36 │ 0.48 │ 0.10 │                           │
│ Apr 26, 2026 │ 0.31 │ 0.33 │ 0.41 │ 0.11 │                           │
└──────────────────────────────────────────────────────────────────────┘
```

- Series toggles use lichen, soil, survey as line colors (NOT the index colorramp — that's reserved for the map overlay).
- Hover/tap a data point: tooltip with date, value, drone, weather.
- Y-axis auto-scales to data range with a small buffer; lines persist on toggle (smooth fade).

**Empty state (zone with no flights):** "No data yet. Once you upload a flight covering this zone, you'll see its vegetation indices here."

---

### S7 — Upload Flight Wizard

Modal on desktop, full-screen sheet on mobile. Three steps.

**Step 1 — Select file:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Upload flight                                                    ✕   │
│ ●━━━━○━━━━○                                                          │
│ File   Metadata   Upload                                             │
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │           Drop your GeoTIFF here                               │   │
│ │           or [ browse files ]                                  │   │
│ │           .tif, .tiff · up to 2 GB                             │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                          [ Cancel ]  [ Next → ]      │
└──────────────────────────────────────────────────────────────────────┘
```

After file selected:
```
│ ✓ may24_ortho.tif · 1.2 GB                                          │
│   Valid GeoTIFF · EPSG:4326 · 8,431 × 6,210 px                      │
│   [ Replace ]                                                        │
```

**Step 3 — Upload & ingest (the trust-building moment):**

```
│ Uploading file…                                                      │
│ ████████████████████░░░░░░░░░░░░░░░░  62% · 740 MB / 1.2 GB         │
│ Don't close this tab until upload finishes.                          │
│                                                       [ Cancel ]      │
```

Then:
```
│ ✓ Uploaded                                                           │
│ Processing on server…                                                │
│ ◐ Computing vegetation indices · est. 1 min 40 sec                  │
│                                                                      │
│ This runs on the server. You can close this window and check back   │
│ from the Flights tab — we'll save your progress.                     │
│                              [ Close and check later ]               │
```

Trust-building elements:
1. **Explicit phase separation.** Upload (determinate, cancellable) vs. Processing (indeterminate, fire-and-forget).
2. **Realistic time estimate** from file size × historical median ingest rate.
3. **Permission to leave.** "You can close this window" is the most important sentence.
4. **Notification on completion** via toast on next page navigation.
5. **No fake progress bar** for processing. Indeterminate is honest.

---

### S8 — Empty & Onboarding States

First-time user on S3 (no zones, no flights). Instead of a tutorial overlay, the empty map **itself** becomes the onboarding:

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐   │
│ │              Welcome to Superintendent.                   │   │
│ │   This is the field record for the land you tend.         │   │
│ │                                                            │   │
│ │   1.  Pan and zoom the map to find your parcel.           │   │
│ │       [ Use my location ]                                  │   │
│ │   2.  Outline your first zone. Tap the pencil below       │   │
│ │       to draw a polygon around a bed, lawn, or border.    │   │
│ │   3.  Upload your first drone flight to see vegetation    │   │
│ │       indices.                                             │   │
│ │                                          [ Dismiss ]      │   │
│ └───────────────────────────────────────────────────────────┘   │
│            [ MAP — pannable beneath the card ]                  │
│                       ┌─────┐                                   │
│                       │  ✎  │ ← pulses gently                   │
│                       └─────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

- Card is dismissible but does not block map interaction.
- Pencil button gets a subtle pulse animation (300ms scale 1.0→1.05→1.0, 4-second interval, stops after first use).
- After first zone drawn: card morphs to step 2 — "Great. Now upload your first flight." with pulse moving to the upload button.
- After first flight ingested: card dismisses itself with a one-line confirmation toast.

---

## 4. Design System Tokens (Tailwind 4 ready)

```ts
colors: {
  ink:      { DEFAULT: '#1B1F1A', 60: '#1B1F1A99', 30: '#1B1F1A4D', 10: '#1B1F1A1A' },
  paper:    { DEFAULT: '#F5F1E8', 2: '#EBE5D4' },
  soil:     { DEFAULT: '#6B4E2E', light: '#8A6B47', dark: '#4A3520' },
  lichen:   { DEFAULT: '#5B6B3F', light: '#7A8A5C', dark: '#3F4A2A' },
  survey:   { DEFAULT: '#1E5A8C', light: '#3D7AAA', dark: '#143F63' },
  iron:     { DEFAULT: '#A8392C', light: '#C25E50', dark: '#7A2920' },
  index: {
    veryLow:  '#3B2C4D',
    low:      '#9B7AA3',
    mid:      '#D9C9B0',
    high:     '#7A9B5C',
    veryHigh: '#2D4A1E',
  },
}

fontFamily: {
  serif: ['"Source Serif 4"', 'Georgia', 'serif'],
  sans:  ['Inter', 'system-ui', 'sans-serif'],
  mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
}

fontSize: {
  xs:   ['12px', '16px'],
  sm:   ['14px', '20px'],
  base: ['16px', '24px'],
  lg:   ['18px', '28px'],
  xl:   ['20px', '28px'],
  '2xl':['24px', '32px'],
  '3xl':['30px', '36px'],
  '4xl':['36px', '40px'],
}

borderRadius: {
  none: '0', sm: '4px', DEFAULT: '6px', md: '8px', lg: '12px', full: '9999px',
}

boxShadow: {
  sm:     '0 1px 2px 0 rgb(27 31 26 / 0.05)',
  DEFAULT:'0 1px 3px 0 rgb(27 31 26 / 0.08), 0 1px 2px -1px rgb(27 31 26 / 0.06)',
  md:     '0 4px 6px -1px rgb(27 31 26 / 0.08), 0 2px 4px -2px rgb(27 31 26 / 0.06)',
  lg:     '0 10px 15px -3px rgb(27 31 26 / 0.08), 0 4px 6px -4px rgb(27 31 26 / 0.04)',
  float:  '0 2px 8px 0 rgb(27 31 26 / 0.12), 0 1px 2px 0 rgb(27 31 26 / 0.08)',
}

transitionDuration: {
  fast: '120ms', base: '200ms', slow: '320ms', legend: '400ms',
}
```

No bounces. No springs. Motion is functional, not decorative.

---

## 5. Concerns & Pushback

### Things I'd change

1. **Reconsider whether "Flights" deserves a top-level nav slot in v0.1.** Recommend 3 tabs (Map/Zones/Settings); Flights as a section inside Zones (or accessible from any zone via the time-series view). Zones are the durable entity; flights are events on those zones.
2. **Mobile drawing is going to be painful regardless.** Recommend drawing zones on desktop initially, with the mobile drawing tools present but minimal. The killer mobile use case is **viewing** pre-drawn zones with vegetation overlays.
3. **GLI and ExG don't span the same range as VARI.** Normalize all three to a consistent scale for display purposes (percentile-based, per-flight) and note in legend. Otherwise users compare apples to oranges.

### UX dead ends flagged

4. **Two-phase upload UI only works if server reliably emits progress events.** Don't ship fake progress. If real progress isn't available, ship "Processing… (large files take 1–5 minutes)" copy instead.
5. **Edit-zone interaction is under-specified.** What happens if the user edits a zone whose polygon no longer overlaps the historical flight rasters in the same way? Recommendation: zone edits create a new zone version; historical aggregates remain attached to the version under which they were computed; the time-series chart shows an "edited" tick mark on the x-axis where geometry changed. **Flag for engineering.**
6. **Bottom tab bar on iOS Safari will fight with the home-bar safe-area inset.** Standard `env(safe-area-inset-bottom)`. Same for the FAB.

### Validate before locking in

7. **Test paper-cream backgrounds in actual sunlight** on the developer's actual phone.
8. **"Field guide" brand position assumes superintendent audience values that aesthetic.** Show mockups to 2–3 actual native-grass golf course superintendents within six months to validate.
9. **Drone model dropdown needs a `drone.bands` field** so the index selector can gain NDVI when multispectral kit arrives.
10. **Data export is missing.** Add a "download my data" affordance to the Account screen sooner than later — supports the archival promise.

---

*Superintendent should feel like a tool the user inherits, not a tool that's chasing them.*
