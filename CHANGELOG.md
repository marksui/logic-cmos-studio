# Changelog

All notable changes to Logic & CMOS Studio are summarized here.

## v1.3.14 - 2026-05-11

- Added real high-resolution screenshots under `docs/screenshots/`.
- Replaced README screenshot placeholders with embedded images and accessibility-focused alt text.
- Added README architecture notes for the parser, K-map, simplifier, CMOS planner, metrics, and React components.
- Added explicit limitations so reviewers understand the tool is educational rather than SPICE-accurate or EDA-grade.
- Added this changelog as the release-note source for future versions.

## v1.3.13 - 2026-05-11

- Fixed exported CMOS SVG files by serializing self-contained inline styles instead of relying on in-page Tailwind classes.
- Added CMOS schematic PNG export next to SVG export.

## v1.3.12 - 2026-05-11

- Improved formula-driven variable detection so the workspace no longer requires manual variable input.
- Expanded support for custom variable names and complex typed expressions.

## v1.3.11 - 2026-05-11

- Aligned the Formula Guide styling with the rest of the studio UI.

## v1.3.10 - 2026-05-11

- Improved gate diagram rendering with cleaner bus-and-tap wiring, Manhattan-style routes, and clearer output labeling.

## v1.3.9 - 2026-05-11

- Upgraded the project into an educational EDA mini-tool with truth tables, Karnaugh maps, simplified equations, Verilog, review content, and static CMOS teaching visuals.
