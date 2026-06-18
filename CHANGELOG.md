# Changelog

All notable changes to Logic & CMOS Studio are summarized here.

## v1.3.22 - 2026-06-17

- Simplified the Formula toolbar by removing the duplicate workspace reset action from the main path.
- Increased the Formula action buttons' touch target height while keeping reset available in the Display menu.

## v1.3.21 - 2026-06-17

- Improved the Formula toolbar on narrow screens by letting actions wrap into a compact two-column layout.
- Made the Presets menu flow inline on mobile while keeping the desktop popover, and added stronger labels for formula controls.

## v1.3.20 - 2026-06-17

- Clarified the Display control by showing the active view name and visible-panel count directly in the workspace header.
- Highlighted the active Quick View preset and added clearer accessibility labels for the display panel menu.

## v1.3.19 - 2026-06-17

- Simplified the Formula Presets menu by removing manual variable-count controls; inputs now stay driven by the parsed formula or selected preset.
- Made Formula examples apply and regenerate immediately, so users no longer need a second Generate click after choosing an example.

## v1.3.18 - 2026-06-17

- Added one-click Display quick views for Logic and CMOS so users can switch between learning, truth-table, export, schematic, network, and netlist-focused layouts without manually toggling every panel.

## v1.3.17 - 2026-06-17

- Remembered the user's last formula, generated truth values, panel visibility, active workspace, gate-wire style, and CMOS output inverter setting in localStorage.
- Added Reset workspace actions that clear the formula and restore default variables, panel visibility, output stage, and workspace state.
- Moved the CMOS output inverter toggle into the main formula area so it can be changed directly from the Logic workspace.

## v1.3.16 - 2026-05-13

- Added a header link to the companion Hardware Interview Trainer portfolio project.
- Added a README related-project link for the local-first hardware interview question bank.

## v1.3.15 - 2026-05-11

- Trimmed README by removing local run, build, GitHub Pages deployment, and project rationale sections from the public-facing document.

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
