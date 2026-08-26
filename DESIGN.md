# Азбука движения Design System

## Product Stance

Азбука движения is an internal operations workspace for school administrators, coaches, and parents. The interface should feel calm, reliable, and work-focused. It should help users find the next operational action quickly, not sell the product or decorate the screen.

## Visual Principles

- Dense but readable: show operational data without turning every section into a card mosaic.
- One job per section: search, create, review, or close work.
- Critical work first: debt, admission blockers, pilot blockers, and over-capacity groups should dominate the scan path.
- Utility copy: labels should name the object or action directly.
- No decorative gradients, blobs, emoji, or marketing-style feature grids.

## Typography

- Primary face: Geist Sans with Cyrillic support.
- Monospace: Geist Mono for technical identifiers when needed.
- Body text should stay at 16px or larger.
- Headings use tight line-height and balanced wrapping.
- Tables and badges use tabular numbers so balances, counts, and dates scan cleanly.
- Letter spacing stays at 0.

## Color

- Background: warm off-white `#f7f7f2`.
- Text: green-black `#1f2523`.
- Muted text: `#5f6b66`.
- Accent: teal `#0f8b8d`, strong teal `#0b5f60`.
- Critical: red `#b3261e`.
- Warning: amber `#b7791f`.
- Success: green `#2f7d32`.

Status colors must be paired with text labels or icons. Do not communicate state by color alone.

## Layout

- Page content is constrained to the admin workspace width.
- Forms use panels when they are the actual work surface.
- Tables may scroll horizontally inside `.table-shell`, never at body level.
- Dense pages should start with search, filters, metrics, or a work queue before maintenance tables.

## Interaction

- Touch targets must be at least 44px.
- High-cardinality entity fields use searchable comboboxes.
- Native selects are reserved for short enums such as status, priority, weekday, and reason.
- Focus states must be visible and use the accent ring.
