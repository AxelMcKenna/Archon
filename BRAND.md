# Archon — Brand System

**Product:** Archon — Construction Management

**Personality:** precise, structural, trustworthy. Construction-software-grade
engineering meets clean SaaS — blueprint clarity, not playful startup.

> This system is derived from and stays consistent with the product code:
> `web/tailwind.config.ts`, `web/src/app/globals.css`, `web/src/app/layout.tsx`.

---

## Typography

| Role | Font | Weights | Use for |
|------|------|---------|---------|
| **Display / Headlines** | **DM Sans** | 600–700 | Hero text, section titles, logo wordmark, big numbers |
| **Body / UI** | **Inter** | 400–600 | Paragraphs, labels, captions, buttons |
| **Mono / Data** | **JetBrains Mono** | 400–500 | Metrics, IDs, code, tabular figures, technical callouts |

All three are free Google Fonts (the product's actual stack), so graphics stay
perfectly on-brand with the app.

**Pairing rules for graphics:**
- Headline in DM Sans 700, tight tracking (`-0.02em`), generous size jump over body.
- Enable tabular numerals (`tabular-nums`) and stylistic sets `ss01`, `cv11` on
  Inter — matches the product's `font-feature-settings`.
- Use JetBrains Mono sparingly as an accent for stats/labels to signal the
  "engineering" feel.

---

## Color palette

The brand is built on three pillars: **white**, **teal**, and **charcoal**.

### Primary — Teal (brand)
| Token | Hex | Use |
|-------|-----|-----|
| Teal 700 | `#0F766E` | Primary buttons, links, logo, key accents |
| Teal 600 | `#0D9488` | Hover, gradients |
| Teal 500 | `#14B8A6` | Bright accent, data viz |
| Teal 100 | `#CCFBF1` | Tints, badge fills, pills |
| Teal 50  | `#F0FDFA` | Section washes, subtle backgrounds |

### Base — White
| Token | Hex | Use |
|-------|-----|-----|
| Canvas       | `#FFFFFF` | Base background |
| Surface soft | `#F7F9FB` | Raised cards on white |
| Surface sunken | `#EEF2F8` | Sunken panels, wells |

### Neutral — Charcoal
| Token | Hex | Use |
|-------|-----|-----|
| Charcoal 900 | `#0B0E14` | Primary text, dark backgrounds |
| Charcoal 800 | `#131822` | Dark panels |
| Charcoal 600 | `#334155` | Strong secondary text |
| Charcoal 500 | `#4A5568` | Secondary text |
| Charcoal 400 | `#94A3B8` | Muted / captions |
| Charcoal 200 | `#E2E8F0` | Borders, dividers |

---

## Suggested combinations for graphics

- **Hero / cover:** Charcoal 900 background → DM Sans white headline → Teal 500
  accent glow → JetBrains Mono micro-labels in Charcoal 400.
- **Light marketing card:** White / Surface-sunken bg → Charcoal 900 headline →
  Teal 700 CTA → Teal 100 fill for a single "proof" highlight.
- **Gradients:** `#0F766E → #14B8A6` (deep → bright teal) for energy on dark or light.
- **Data / stat blocks:** big JetBrains Mono numbers in Teal 700 on Surface sunken.

---

## Texture & finish (signature, optional)

- Barely-there **grain** overlay (`opacity 0.022`) over flat fills — adds the
  premium "tooth" the product CSS already uses.
- Soft **layered shadows**, not hard drop shadows. Hairline borders
  (`rgba(15,17,21,0.07)`) instead of heavy strokes.
- **Corner radius:** tight (`4px`) for a structural, engineered look.

---

## Logo / wordmark guidance

- **"Archon"** set in DM Sans 700, optionally with the "A" or a load-bearing
  structural motif (column, truss, contour line).
- Mono tagline beneath: `CONSTRUCTION MANAGEMENT` in JetBrains Mono, uppercase,
  letter-spacing `0.15em`, Charcoal 400.
