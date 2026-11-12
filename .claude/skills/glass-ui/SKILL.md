---
name: glass-ui
description: The Trend Detective glass panel design system - glass tokens (blur, radius, tint, border), panel anatomy for the left, right and bottom drawers, the pointer-events rule that keeps the globe interactive, the 4.5:1 contrast rule over bright ice, reduced-motion and solid fallbacks, and the phone layout. Use when building or testing any panel, drawer, popup or overlay, and as the QA checklist for visible UI.
---

# Glass UI

Tokens as CSS: [tokens.css](tokens.css). The app copy is `apps/web/src/styles/glass.css`, imported by `apps/web/src/index.css`; keep the two identical. A full-screen globe sits behind everything; dark glass panels float on top.

## Tokens (from plan section 7)
| Token | Value | Notes |
|---|---|---|
| `--glass-blur` | 14px (allowed 12-16) | Keep blurred areas small; never blur full-screen |
| `--glass-radius` | 18px (allowed 16-20) | Inner elements: radius minus padding |
| `--glass-tint` | `rgba(12,16,24,0.62)` (allowed 0.55-0.70) | Raise opacity, not blur, to fix contrast |
| `--glass-tint-strong` | `rgba(12,16,24,0.78)` | Over bright ice, and for text-dense panels |
| `--glass-border` | `1px solid rgba(255,255,255,0.12)` (allowed 0.10-0.16) | |
| `--glass-solid` | `rgb(14,18,27)` | Fallback with no backdrop-filter |
| `--glass-gap` | 12px | Panel to screen edge and panel to panel |
Use the Tailwind utilities `glass` and `glass-strong` from `tokens.css`; do not restyle panels ad hoc.

## Panel anatomy
- **Overlay root:** `fixed inset-0` with `pointer-events: none`. It holds every panel.
- **Panel:** `.glass` with `pointer-events: auto`. Header (title, collapse button with `aria-expanded` and `aria-controls`), scrollable body (`overflow-y: auto`, `overscroll-behavior: contain`), optional footer (primary action).
- **Left drawer:** inputs (variable, region, time range, compare, Run analysis). **Right drawer:** results in the fixed order: parameters, verdict, statistical report, interpretation, notes. **Bottom drawer:** charts, opens when an analysis is ready; the time scroller slides up with it.
- Drawers are custom panels animated with Motion. **Never** shadcn Sheet or Dialog for drawers: they are modal and block the globe. Dialog is only for the Describe popup.
- Collapsed drawers leave a small glass tab so they can be reopened by mouse, touch and keyboard.

## The pointer-events rule
The globe must stay draggable and zoomable with every drawer open. Only panels themselves capture pointer events; gaps between panels pass through to the canvas. Test: with all drawers open, drag the globe in every visible gap.

## Contrast rule
All text reaches **4.5:1** (3:1 for large text and icons) against the worst case behind it: bright Greenland or Antarctic ice under the panel. Fix failures by raising tint opacity (`glass-strong`), never by adding blur. Numbers use tabular numerals.

## Motion and fallbacks
- `prefers-reduced-motion: reduce`: drawers appear without slide or scale; no autoplaying motion except the Describe video, which has a pause control.
- `@supports not (backdrop-filter: blur(1px))`: panels use `--glass-solid`.
- Low-power fallback (or user toggle): solid panels, no blur.
- Durations 150-250 ms, ease-out; never animate layout of the globe canvas.

## Phone layout (under 768 px wide)
- Left and right drawers become bottom sheets (one open at a time) with a drag handle and a visible close button; max height 85dvh.
- Bottom chart drawer becomes a full-width sheet; charts scroll horizontally only inside their own container.
- Respect `env(safe-area-inset-*)`. Touch targets at least 44x44 px.
- The globe stays visible above an open sheet so the selected region can be seen.

## QA checklist (ui-qa)
1. With all drawers open, the globe drags and zooms in every gap.
2. Every text element meets 4.5:1 over the brightest ice view (screenshot Greenland and Antarctica presets).
3. Keyboard: Tab reaches every control in visual order; focus ring visible on glass; Escape closes the Describe popup and returns focus.
4. Reduced motion: no slide or scale animations.
5. No backdrop-filter (force it off in devtools): panels turn solid and stay readable.
6. 390x844 phone viewport: sheets work, nothing scrolls the page sideways, touch targets 44 px.
7. "SYNTHETIC DATA" watermark visible whenever data is synthetic.
