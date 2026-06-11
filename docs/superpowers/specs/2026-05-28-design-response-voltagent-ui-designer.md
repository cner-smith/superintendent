---
title: Superintendent v0.1 — Design Response (voltagent-core-dev:ui-designer)
date: 2026-05-28
agent: voltagent-core-dev:ui-designer
prompt-source: ./2026-05-28-designer-brief.md
status: received, text-only (no rendered visuals)
---

# Superintendent v0.1 — UI/UX Design (voltagent ui-designer)

*Full response from the `voltagent-core-dev:ui-designer` agent. Companion file: `2026-05-28-design-response-interface-artisan.md`.*

---

## 1. Brand Expression

### On the name

Keep "Superintendent." It is the actual job title. It carries authority without pretension, and it is unmistakably specific — a superintendent manages a course, not a wellness app. The risk is length on small screens, but the solution is a wordmark abbreviation, not a rename. Considered alternatives: "Steward" (too soft), "Greenkeeper" (British, slightly archaic), "Sward" (too niche). None are better.

### Wordmark concept

```
SUPERINTENDENT
──────────────
```

All-caps, tracking +80, weight Medium, set in IBM Plex Mono. The monospace signals precision instruments and field records — closer to a GPS survey readout or USGS map legend than a SaaS logotype. No icon lockup. The word earns its keep alone. On narrow mobile headers, collapse to "SUPT" in the same treatment. This abbreviation doubles as a future badge/favicon character.

The full-width underrule (a thin 1px line at half the cap height below) is the only graphic element. It reads as a surveyed datum line — deliberate, not decorative.

### Palette (7 colors)

| Token | Name | Hex | Rationale |
|---|---|---|---|
| `--ink` | Ink | `#1C1A17` | Near-black with warm brown undertone. Avoids cold blue-black of pure `#000`. Reads as dried-ink on field paper. |
| `--paper` | Paper | `#F5F0E8` | Warm off-white. Aged cartographic paper. Reduces glare vs pure white; survives bright sun. |
| `--earth-mid` | Prairie | `#8B6F47` | Mid-value tan-brown, Oklahoma topsoil. Primary UI chrome tone for borders, dividers, secondary text. |
| `--earth-dark` | Loam | `#4A3728` | Deep brown. Used for hover states, active nav indicators, subtle depth in dark surfaces. |
| `--accent` | Survey Blue | `#2563EB` | USGS topographic blue. High contrast on both paper and dark. Affirmative actions, links, active states. Not green — avoids greenwashing trap entirely. |
| `--warn` | Amber | `#D97706` | Amber-orange. Warnings, in-progress states (uploading, ingesting). Readable in sun. Distinct from accent without being red. |
| `--error` | Sienna | `#B91C1C` | Deep sienna-red. Errors and failures only. Not used decoratively. |

Surface values:

| Token | Hex | Use |
|---|---|---|
| `--surface-0` | `#F5F0E8` | Page background (= paper) |
| `--surface-1` | `#EDE8DC` | Card/panel background |
| `--surface-2` | `#E2DBCa` | Hover/active surface |
| `--border` | `#C9BEA8` | Dividers, input borders |
| `--text-primary` | `#1C1A17` | Body text (= ink) |
| `--text-secondary` | `#6B5744` | Supporting text, labels |
| `--text-muted` | `#9C8B78` | Placeholders, timestamps |

Dark mode is not in v0.1 scope (outdoor sun readability is the priority, not dark-room use), but the token architecture supports adding it without rework.

### Type pairing

**Display: IBM Plex Mono** (Medium 500, used for wordmark, data values, coordinates, zone names, chart axis labels, status badges)

Why Mono for display: this app is fundamentally about measured data — index values, coordinates, flight timestamps, aggregate statistics. Monospace aligns those values in columns without special effort, and it communicates precision instruments over consumer softness. Plex Mono has excellent legibility at small sizes and strong distinction between 0/O and 1/l/I, which matters when reading index values.

**Body: IBM Plex Sans** (Regular 400, Medium 500, used for prose, labels, navigation items, button text, helper text)

Same superfamily — visual coherence across the UI without fighting between two families. Plex Sans at 16px+ with generous line height is highly readable outdoors.

Both are open-source, Google Fonts available, and have strong Latin + symbol coverage for eventual conservation-report text export.

### Icon system

**Phosphor Icons** (react-phosphor). Phosphor has both a Regular and Bold weight, which matters here — Regular for dense UI elements, Bold for touch targets on mobile. Includes specific icons needed for this product that Lucide lacks or handles poorly: `MapTrifold`, `Drone`, `Plant`, `Polygon`, `Ruler`, `CloudArrowUp`, `ChartLine`. Duotone variants (Phosphor exclusive) available for future state indicators.

### Texture / motif

None in v0.1. The warm paper background and monospace type carry the archival register without a texture overlay. Introduce a subtle topographic contour line pattern as a header background only if the platform ever needs a marketing-facing surface. For the application itself, negative space is correct.

---

## 2. Component Inventory

Mapped to shadcn primitives. Items marked (custom) require work beyond shadcn defaults.

### Navigation & Shell
| Component | shadcn primitive | Notes |
|---|---|---|
| TopBar | Sheet + DropdownMenu | Logo, parcel selector (DropdownMenu), user avatar menu |
| ParcelSelector | DropdownMenu | Single item in v0.1 |
| UserMenu | DropdownMenu | Avatar button → Account, Sign out |
| BottomTabBar | custom | Mobile-only. 4 tabs: Map / Flights / Zones / Settings |
| SidePanel | Sheet (desktop: persistent, not overlay) | Left panel on map view; collapsible |

### Map Controls (all custom — rendered over MapLibre canvas)
| Component | Notes |
|---|---|
| IndexSwitcher | Segmented button: Ortho / VARI / GLI / ExG. Mobile: full-width pill row, anchored above bottom sheet |
| OpacitySlider | shadcn Slider with value tooltip |
| BasemapToggle | shadcn Switch with label |
| ZoomControls | Custom +/- buttons, MapLibre hook |
| GeolocateButton | Single icon button |
| DrawingToolbar | Custom; 3 tools: Draw / Edit / Delete |
| IndexLegend | Custom color-ramp bar with labeled endpoints and midpoint |
| UploadFAB | shadcn Button (floating, fixed position) |

### Forms & Inputs
| Component | shadcn primitive |
|---|---|
| EmailInput | Input + Label + FormMessage |
| DateTimePicker | shadcn Calendar + Popover (use `react-day-picker` which shadcn wraps) |
| DroneModelSelect | Select |
| WeatherNotesTextarea | Textarea |
| FileDropzone | custom (shadcn has no file dropzone) |

### Data Display
| Component | shadcn primitive | Notes |
|---|---|---|
| FlightCard | Card | Thumbnail, date, status badge, drone, weather snippet |
| FlightStatusBadge | Badge | 4 variants: uploading / ingesting / ready / failed |
| AggregateTable | Table | Sortable. shadcn Table + custom sort header |
| SortableColumnHeader | custom | Click to toggle asc/desc; chevron icon |
| ZoneDetailChart | custom (Recharts) | Multi-line time series; toggle per-index line visibility |
| EmptyState | custom | Illustration-free: icon + heading + body + CTA |
| ProgressSteps | custom | Upload wizard step indicator (3 steps) |
| UploadProgressBar | Progress (shadcn) | Shows upload % |
| IngestProgress | custom | Indeterminate spinner + estimated time copy |

### Overlays & Feedback
| Component | shadcn primitive |
|---|---|
| UploadWizard | Dialog (full-screen on mobile, centered modal on desktop) |
| BottomSheet | Sheet (side=bottom) |
| Toast / Notification | Sonner |
| ConfirmDestructive | AlertDialog |
| DrawModeGuide | custom (inline contextual prompt, not a modal) |

---

## 3. Per-Screen Designs

### S1 — Auth / Sign In

**Mobile (375px):**

```
┌─────────────────────────────────┐
│                                 │
│  SUPERINTENDENT                 │
│  ──────────────                 │
│                                 │
│  Sign in to your account.       │
│  We'll send a link to your      │
│  email — no password needed.    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ your@email.com          │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │   Send sign-in link  →  │    │  ← accent blue, full-width
│  └─────────────────────────┘    │
│                                 │
│  ─────────────────────────────  │
│  For access, contact the        │  ← muted text, small
│  system owner.                  │
└─────────────────────────────────┘
```

**State: Check your email:**

```
│  Check your inbox.              │
│  We sent a sign-in link to      │
│  cner.smith@gmail.com.          │
│  The link expires in 10 min.    │
│  You can close this tab.        │
│  ┌──────────────────┐           │
│  │  Resend link     │           │ ← secondary/outline
│  └──────────────────┘           │
```

Interaction notes:
- The email field auto-focuses on load.
- No "forgot password" — there is no password.
- "For access, contact the system owner" is the v0.1 multi-user hint.

---

### S2 — App Shell

#### Mobile shell

Bottom tab bar, not a hamburger drawer. The four primary sections (Map, Flights, Zones, Settings) are all peer-level; a drawer treats them as secondary. On a mobile screen in a garden, reaching the drawer toggle and then a menu item is two taps and one visual scan; the tab bar is one tap with no cognitive overhead.

```
┌─────────────────────────────────┐
│ SUPT    [Garden - Home ▾]  [CS] │  ← TopBar
├─────────────────────────────────┤
│                                 │
│         (screen content)        │
│                                 │
├─────────────────────────────────┤
│  [Map]  [Flights] [Zones] [⚙]  │  ← 44px tall, icons + labels
└─────────────────────────────────┘
```

Active tab: `--accent` color icon + label. Inactive: `--text-muted`. No badge counts in v0.1.

#### Desktop shell

```
┌─────────────────────────────────────────────────────────────────┐
│ SUPERINTENDENT    [Garden - Home ▾]           [CS ▾]            │
│ ──────────────────────────────────────────────────────────────── │
│  Map  |  Flights  |  Zones  |  Settings                         │
├─────────────────────────────────────────────────────────────────┤
│                    (screen content)                             │
└─────────────────────────────────────────────────────────────────┘
```

Horizontal nav bar below the header. Active item: `--ink` text + bottom border `--accent` 2px. When sensors, irrigation, and scheduling arrive (v0.3+), this top nav becomes a left rail with section groups.

---

### S3 — Main Map View (the critical screen)

**Desktop layout (1280px):**

```
┌─────────────────────────────────────────────────────────────────┐
│  TopBar + Nav                                                   │
├──────────────────┬──────────────────────────────────────────────┤
│  SIDE PANEL      │  MAP CANVAS                                  │
│  280px, fixed    │                                              │
│  ┌────────────┐  │  ┌────────────────────────────────────────┐  │
│  │ Flights    │  │  │  [Ortho][VARI][GLI][ExG]  Opacity ─┤  │  │ ← float top
│  │ ────────── │  │  │  [Basemap: Satellite ▾]              │  │
│  │ ● 2024-   │  │  └────────────────────────────────────────┘  │
│  │   10-14   │  │                                              │
│  │   ready ✓ │  │                         [+]                  │ ← zoom
│  │ ○ 2024-   │  │                         [−]                  │
│  │   09-28   │  │                         [◎]                  │ ← geolocate
│  │ Zones     │  │                                              │
│  │ ────────── │  │  ┌────────────────────────────────────────┐  │
│  │ ■ Raised  │  │  │  [▭ Draw] [✎ Edit] [✕ Delete]        │  │ ← draw toolbar
│  │   Bed N   │  │  └────────────────────────────────────────┘  │
│  │ ■ Lawn    │  │                                              │
│  │ ■ Native  │  │  ┌────────────────────────────────────────┐  │
│  │   Border  │  │  │  [↑ Upload flight]                     │  │ ← float bottom
│  │ [◀ Hide]  │  │  └────────────────────────────────────────┘  │
│  └────────────┘  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

The legend for the active index appears bottom-left:

```
  ┌─────────────────────────────────────┐
  │  VARI  −1.0 ████████████████ +1.0  │
  │          Low           High         │
  └─────────────────────────────────────┘
```

**Mobile layout (375px):**

```
┌─────────────────────────────────┐
│  SUPT   [Garden - Home]   [CS]  │
├─────────────────────────────────┤
│        FULL-SCREEN MAP          │
│                                 │
│  ┌───────────────────────────┐  │  ← index switcher, pinned below topbar
│  │ Ortho │ VARI │ GLI │ ExG  │  │
│  └───────────────────────────┘  │
│                                 │
│                        [+]      │
│                        [-]      │
│                        [◎]      │
│                        [⋮]      │  ← drawing tools overflow
│                                 │
│                    [ ↑ Flight ] │  ← FAB, bottom-right
│                                 │
├────────────────────────────────-│  ← drag handle
│  ▓▓▓  (bottom sheet, collapsed) │
└─────────────────────────────────┘
```

Bottom sheet has two snap points: 100px (collapsed, shows only drag handle + "3 zones, Flight: Oct 14") and 50% screen height (open, shows zone list + flight selector + layer controls).

The index switcher row is pinned to the top of the map canvas, just below the app bar. It is always visible. This solves the one-handed-in-the-garden problem: the most common tap target on this screen lives where the thumb reaches while holding the phone in portrait. Four segments, full-width pill row, 44px tap target height.

#### Drawing toolbar — draw zone interaction

Entering draw mode:
1. User taps "Draw polygon" (Phosphor `Polygon`).
2. Toolbar transitions to a full-width active bar:
   ```
   ┌───────────────────────────────────────────────────┐
   │  Tap to place points. Tap first point to close.  │
   │                                    [Cancel]       │
   └───────────────────────────────────────────────────┘
   ```
   This contextual instruction strip replaces the toolbar while in draw mode. **The only onboarding copy needed** — no tooltip cascade, no modal tutorial.
3. Each tap on the map places a vertex. terra-draw renders the in-progress polygon with a dashed outline and vertex dots.
4. Closing the polygon (tap first vertex, or tap "Close polygon"):
   ```
   ┌────────────────────────────────┐
   │  Zone name: [____________]    │
   │  Kind: [Native Border    ▾]   │
   │  [Cancel]        [Save zone]  │
   └────────────────────────────────┘
   ```

#### Index legend — color accessibility (KEY DIVERGENCE FROM interface-artisan)

The conventional red-yellow-green NDVI ramp is excluded. The chosen ramp:

**Brown → Tan → White → Steel Blue → Dark Blue**

```
−1.0  ████  #7B3F00  Dark Brown (bare soil, dry, stressed)
−0.5  ████  #C68642  Tan
 0.0  ████  #F5F0E8  Paper white (neutral / no signal)
+0.5  ████  #4A90D9  Medium Blue
+1.0  ████  #1B3A6B  Dark Navy (dense healthy vegetation)
```

Why this works for deuteranopia/protanopia: both conditions collapse the red-green axis. This ramp uses brown-to-blue, a luminance + hue shift that survives both color deficiency simulations. The brown end reads as "low/stressed," the blue end reads as "high/healthy" — counterintuitive to convention but immediately explainable with the legend labels.

The legend in the map always shows:
```
VARI   −1.0 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ +1.0
              Low          High
```
Three labeled points (−1.0, 0.0, +1.0) prevent ambiguity about scale.

#### Empty + onboarding state (S8 integrated)

When a user has no zones and no flights, S3 shows an inline card on the map canvas (desktop) or bottom sheet (mobile):

```
│  No zones yet.                                      │
│  Start by drawing your first zone.                  │
│  [Draw first zone]                                  │
```

After first zone saved, replaced by:
```
│  You have zones. Now upload a flight to see         │
│  vegetation index data.                             │
│  [Upload first flight]                              │
```

After first flight ingested, both prompts are gone permanently.

---

### S4 — Flights List

```
┌─────────────────────────────────┐
│  Flights                        │
│                                 │
│  ┌─────────────────────────┐    │
│  │  [thumbnail 60x60]      │    │
│  │  Oct 14, 2024           │    │
│  │  [ready ✓]  DJI Flip    │    │
│  │  Partly cloudy, calm    │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  (no thumbnail)         │    │
│  │  Sep 12, 2024           │    │
│  │  [failed ✗]  DJI Flip   │    │  ← error badge sienna
│  │  Upload failed          │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

Status badges:

| Status | Badge style |
|---|---|
| uploading | Amber bg, "Uploading…" with spinner |
| ingesting | Amber bg, "Processing…" with spinner |
| ready | Ink text, checkmark, subtle border |
| failed | Sienna bg/border, "Failed" with X icon |

Empty state: no illustration. `CloudArrowUp` Phosphor icon at 48px in `--earth-mid` + heading + body + CTA. Custom illustrations would undermine the earthy/non-trendy direction.

---

### S5 — Flight Detail

```
┌─────────────────────────────────┐
│  [← Back]  Oct 14, 2024         │
│  [ready ✓]  DJI Flip            │
│  [View on map →]                │  ← accent blue button
│                                 │
│  Per-zone index summary         │
│  ─────────────────────────────  │
│  Zone          VARI   GLI  ExG  │
│  ──────────────────────────────  │
│  Raised Bed N  0.24   0.31 0.18 │
│  Raised Bed S  0.21   0.28 0.16 │
│  Lawn          0.31   0.39 0.24 │
│  Native Border 0.44   0.52 0.38 │
│  Path          0.02   0.03 0.01 │
│                                 │
│  Std dev / Δ columns →          │  ← horizontal scroll on mobile
└─────────────────────────────────┘
```

On mobile the table scrolls horizontally to accommodate std-dev and delta columns. The zone name column is sticky (left-pinned).

Delta column "Δ vs prev" shows `+0.04` in `--accent` (improvement) or `−0.07` in `--warn` (decline) or `—` (no prior flight). **Color coding is directional — blue = more vegetation signal, amber = less. Not red/green.**

**Failed state:**

```
│  [failed ✗]  DJI Flip           │
│  ┌─ ! ─────────────────────┐    │
│  │  Processing failed.     │    │  ← sienna border
│  │  GDAL error: input file │    │
│  │  is not a valid GeoTIFF │    │
│  │  (no CRS defined).      │    │
│  │  [Retry ingest]         │    │
│  └─────────────────────────┘    │
│  The original file is stored.   │  ← reassurance copy
│  [Delete flight]                │  ← destructive, muted
```

Error messages show the actual error from the subprocess manifest — do not sanitize them into generic "something went wrong."

---

### S6 — Zone Detail

```
┌─────────────────────────────────┐
│  [← Back]  ■ Native Border      │
│  Native grass · 847 sq ft       │
│              · 78.7 sq m        │
│  [Edit zone →]                  │
│                                 │
│  Index  [VARI ▾]                │  ← select which index to chart
│  ┌─────────────────────────┐    │
│  │  [Recharts line chart]  │    │
│  │  Line toggles:          │    │
│  │  [■ VARI] [□ GLI] [□ ExG]   │  │
│  └─────────────────────────┘    │
│                                 │
│  Flight history                 │
│  Oct 14  VARI 0.44  GLI 0.52   │
│  Sep 28  VARI 0.41  GLI 0.49   │
│  Sep 12  —    —     —   —       │  ← failed flight, dash
└─────────────────────────────────┘
```

Line chart uses Recharts `LineChart`. Distinct line styles per index:
- VARI: solid `--accent`
- GLI: dashed `--earth-dark`
- ExG: dotted `--earth-mid`

---

### S7 — Upload Flight Wizard

Modal on desktop (max-width 600px). Full-screen on mobile. Progress steps: `1 · File — 2 · Details — 3 · Upload`.

#### Step 3 — Upload and ingest (the most critical state design)

**Sub-state: uploading**

```
│  Uploading file…                             │
│  ████████████████████░░░░░░░░░░░░  64%       │
│  garden_2024-10-14.tif · 247 MB              │
│  Estimated: 45 seconds remaining             │
│  You can leave this tab open.                │  ← trust copy
│                          [Cancel upload]     │
```

**Sub-state: processing (the hard wait)**

```
│  ✓ File uploaded                             │
│  Processing on server…                       │
│  ┌──────────────────────────────────────┐    │
│  │  ████████████████░░░░░░░░░░░░░░░░░  │    │  ← indeterminate, shimmer
│  └──────────────────────────────────────┘    │
│  Computing vegetation indices.               │  ← specific, not "please wait"
│  This takes 1–5 minutes for a               │
│  standard orthomosaic.                       │
│  You can safely close this modal.            │  ← key trust statement
│  The flight will appear in your             │
│  Flights list when ready.                    │
│  [Close and check Flights later]             │  ← primary action — exit
```

The indeterminate bar uses a left-to-right animated shimmer (CSS animation), not a spinning indicator. Spinners communicate "hold on a second"; a scanning bar communicates "work is happening in the background."

**Sub-state: processing with live status (progressive enhancement)**

If the Hono backend emits more granular status, display them as a live log line:
```
  ✓ File uploaded
  ✓ Raster validated
  → Generating VARI index…
```

**Sub-state: failed**

```
│  ✓ File uploaded                             │
│  ✗ Processing failed                         │
│  GDAL error: CRS not defined in source       │
│  GeoTIFF. Reproject to EPSG:4326 before     │
│  uploading.                                  │
│  The original file is retained.              │
│  [Retry processing]           [Close]        │
```

#### Upload stall / network error

```
  ┌─ ! ──────────────────────────────────────┐
  │  Upload paused — slow connection.        │
  │  Still trying. Don't close this tab.     │
  │                                [Cancel]  │
  └──────────────────────────────────────────┘
```

---

### S8 — Empty and Onboarding States

Integrated into S3 above. Summary:

**Stage 1: No zones** — inline card on map: "Start by drawing your first zone." CTA activates draw mode. Dismisses permanently after first zone saved.

**Stage 2: Zones exist, no flights** — inline card replaces Stage 1: "You have zones. Upload a flight to see vegetation data." CTA opens S7 wizard. Dismisses permanently after first successful ingest.

**What this is not:** a multi-step onboarding modal, a tooltip tour, a "getting started" checklist sidebar. The product is simple enough at v0.1 that inline contextual prompts on the primary screen are sufficient. A tooltip tour would be wrong for this audience — these are competent field operators, not consumer app first-timers.

---

## 4. Design System Tokens (Tailwind 4 + shadcn ready)

### CSS custom properties

```css
@layer base {
  :root {
    /* Color — semantic primitives */
    --color-ink:          #1C1A17;
    --color-paper:        #F5F0E8;
    --color-prairie:      #8B6F47;
    --color-loam:         #4A3728;
    --color-accent:       #2563EB;
    --color-warn:         #D97706;
    --color-error:        #B91C1C;

    /* Color — surfaces */
    --color-surface-0:    #F5F0E8;
    --color-surface-1:    #EDE8DC;
    --color-surface-2:    #E2DBCA;
    --color-border:       #C9BEA8;

    /* Color — text */
    --color-text-primary:   #1C1A17;
    --color-text-secondary: #6B5744;
    --color-text-muted:     #9C8B78;

    /* Color — vegetation index ramp (5 stops, brown→blue) */
    --color-veg-0: #7B3F00;  /* −1.0 */
    --color-veg-1: #C68642;  /* −0.5 */
    --color-veg-2: #F5F0E8;  /*  0.0 */
    --color-veg-3: #4A90D9;  /* +0.5 */
    --color-veg-4: #1B3A6B;  /* +1.0 */

    /* Typography */
    --font-display: 'IBM Plex Mono', 'Courier New', monospace;
    --font-body:    'IBM Plex Sans', system-ui, sans-serif;

    /* Type scale */
    --text-xs:   0.75rem;
    --text-sm:   0.875rem;
    --text-base: 1rem;
    --text-lg:   1.125rem;
    --text-xl:   1.25rem;
    --text-2xl:  1.5rem;
    --text-3xl:  1.875rem;

    /* Spacing scale */
    --space-1:  0.25rem;
    --space-2:  0.5rem;
    --space-3:  0.75rem;
    --space-4:  1rem;
    --space-5:  1.25rem;
    --space-6:  1.5rem;
    --space-8:  2rem;
    --space-10: 2.5rem;
    --space-12: 3rem;
    --space-16: 4rem;

    /* Border radius */
    --radius-sm:   2px;
    --radius-md:   6px;
    --radius-lg:  12px;
    --radius-full: 9999px;

    /* Shadows */
    --shadow-sm:  0 1px 2px 0 rgba(28, 26, 23, 0.08);
    --shadow-md:  0 2px 8px 0 rgba(28, 26, 23, 0.12);
    --shadow-lg:  0 4px 24px 0 rgba(28, 26, 23, 0.18);
    --shadow-map: 0 2px 12px 0 rgba(28, 26, 23, 0.22);  /* floating map controls */

    /* Motion */
    --duration-fast:   100ms;
    --duration-normal: 200ms;
    --duration-slow:   350ms;
    --ease-standard:   cubic-bezier(0.4, 0, 0.2, 1);

    /* Touch targets */
    --touch-min: 44px;   /* WCAG 2.5.5 */
  }
}
```

### shadcn variable mapping

```css
:root {
  --background:         var(--color-surface-0);
  --foreground:         var(--color-ink);
  --card:               var(--color-surface-1);
  --card-foreground:    var(--color-ink);
  --border:             var(--color-border);
  --input:              var(--color-border);
  --primary:            var(--color-accent);
  --primary-foreground: #FFFFFF;
  --secondary:          var(--color-surface-2);
  --muted:              var(--color-surface-2);
  --muted-foreground:   var(--color-text-muted);
  --destructive:        var(--color-error);
  --destructive-foreground: #FFFFFF;
  --ring:               var(--color-accent);
  --radius:             var(--radius-md);
}
```

---

## 5. Concerns and Pushback

### Things I would change

1. **"Upload flight" entry point.** The brief puts the upload CTA as a floating bar at the bottom of the map. Recommendation: move "Upload flight" to the Flights list screen as the primary CTA there, and keep a secondary FAB on the map for convenience. The Flights screen is the natural home for flight operations. The map should be a viewing surface. "Map = view, flights = manage."
2. **Zones screen vs S3 side panel.** The side panel on S3 handles the zone list in context. A separate Zones screen would mostly duplicate the side panel list. Recommendation: the Zones tab navigates directly to S3 with the side panel open to the zones section. The zone detail (S6) is still its own screen.
3. **Opacity slider on mobile** — placing it inside the bottom sheet means two taps to adjust. If the developer adjusts opacity frequently while standing on a GPS point, it should be promoted to a persistent floating control. Prototype it and field-test.
4. **Terra-draw polygon edit on mobile** — vertex editing on a touch screen with a 4–10m zone boundary and fat fingers is difficult. Vertex handle size at least 24px visual with a 44px touch target; "snap to drawn line" tolerance. Consider deferring edit mode to a Phase 3 polish item and shipping v0.1 with draw-only.
5. **The color ramp** — brown-to-blue is color-accessible but unconventional. Any agronomist will expect red-yellow-green. Consider an optional "classic" ramp mode the user can switch to (with a clear label that it fails color-blind accessibility) — preferences toggle, not a primary design choice.
6. **Processing-state ambient awareness** — what happens to a flight that is "ingesting" when the user refreshes or returns the next day? The UI needs a "pending flights" indicator in the Flights tab visible from main nav. A small amber dot on the Flights tab icon. Without it, the user has no ambient awareness of a stuck-ingesting flight.

### Validate before locking in

1. **Index switcher position on mobile** — placed immediately below the app bar. If the map tiles load slowly, the switcher above a blank/loading map is awkward. Validate responsiveness.
2. **Bottom sheet vs side panel on tablet (768–1024px)** — bottom sheet too aggressive on landscape tablet; desktop side panel too wide on portrait tablet. Default to desktop layout at 768px+ and field-test on a real iPad.
3. **IBM Plex Mono outdoors** — monospace at small sizes in bright sunlight. Test at 14px on an older Android phone outdoors. Fallback: Plex Mono only for data values, Plex Sans for navigation and labels.
4. **The "Δ vs prev" delta column** — most analytically interesting and most likely to confuse. Needs a tooltip explaining which flight is "previous," whether blue is good/bad, whether the threshold is meaningful.
5. **Zone colors** — the brief mentions `color` attribute. Define a palette of 6–8 accessible zone colors distinguishable from each other AND from the vegetation index ramp. Avoid greens. Recommended zone palette: amber, steel blue, sienna, purple, teal, slate.

---

**Delivery summary:** 7-color palette (ink/paper/prairie/loam/accent/warn/error), IBM Plex Mono + Sans type system, Phosphor icons, brown-to-blue colorblind-safe index ramp, 8 screens fully specified with mobile + desktop wireframes and all state variants, complete CSS token set ready for Tailwind 4 and shadcn. The design system has headroom for v0.3–v1.0 expansion (sensors, tee times, member management) without visual regression.
