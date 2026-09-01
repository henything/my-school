# Азбука движения Design System

## Product Stance

Азбука движения is an internal operations workspace for school administrators, coaches, and parents. The chosen direction is Variant B, "Яркая операционка": work-focused structure with the energy of the school brand. The interface should make the next operational action obvious while feeling recognizably connected to the children's school.

## Visual Principles

- Bright but disciplined: use brand color for navigation, priority, and key metrics, not for every surface.
- Dense but readable: show operational data without turning every section into a card mosaic.
- One job per section: search, create, review, or close work.
- Critical work first: debt, admission blockers, pilot blockers, and over-capacity groups should dominate the scan path.
- Utility copy: labels should name the object or action directly.
- Soft waves are allowed only on major page headers and should never compete with tables or forms.
- Photos may appear in small brand panels, login, and parent-facing screens, but not inside dense task rows.

## Typography

- Primary face: Geist Sans with Cyrillic support.
- Monospace: Geist Mono for technical identifiers when needed.
- Body text should stay at 16px or larger.
- Page hero headings may be larger and bolder; compact panels keep smaller headings.
- Tables and badges use tabular numbers so balances, counts, and dates scan cleanly.
- Letter spacing stays at 0.

## Color

- Background: warm off-white `#f4f6f1`.
- Text: green-black `#17221f`.
- Muted text: `#5f6b66`.
- Primary blue: `#0788dc`.
- Strong blue: `#006eb8`.
- Brand green: `#7ac700`.
- Brand yellow: `#ffc400`.
- Brand orange: `#ff6a00`.
- Critical: red `#ff2639`.
- Warning: amber/yellow `#ffc400`.
- Success: green `#6fc600`.

Status colors must be paired with text labels or icons. Do not communicate state by color alone.

## Layout

- Page content is constrained to the admin workspace width.
- Forms use panels when they are the actual work surface.
- Tables may scroll horizontally inside `.table-shell`, never at body level.
- Dense pages should start with search, filters, metrics, or a work queue before maintenance tables.
- Top-level operational pages may start with a blue brand header and a white wave edge, then place priority metrics directly below it.

## Interaction

- Touch targets must be at least 44px.
- High-cardinality entity fields use searchable comboboxes.
- Native selects are reserved for short enums such as status, priority, weekday, and reason.
- Focus states must be visible and use the primary blue ring.
