# Logic & CMOS Studio

Logic & CMOS Studio is a browser-based educational EDA mini-tool that converts Boolean logic into truth tables, Karnaugh maps, simplified equations, Verilog, and static CMOS pull-up / pull-down schematics.

- Version: v1.3.12
- GitHub Pages: https://marksui.github.io/logic-cmos-studio/

## Features

- Boolean formula input with words, symbols, postfix NOT, custom variables, function headers, minterms, and don't-care terms.
- Truth table generation with editable output cells.
- 2-variable, 3-variable, and 4-variable Karnaugh maps using Gray-code ordering, with grouped implicant indicators.
- SOP and POS simplification with selected terms, essential prime implicants, minterms, maxterms, and don't-cares.
- Synthesizable Verilog module export with a copy button.
- Educational estimates for literal count, gate count, transistor count, and logic depth.
- Static CMOS pull-up and pull-down schematic visualization with PMOS/NMOS networks, netlist, sizing notes, and SVG export.
- Example gallery for NOT, NAND2, NOR2, AOI/OAI, MUX, majority, half adder, and full adder logic.
- Shareable URL support through `?expr=...`.

## Screenshots

Screenshots placeholder:

- Logic workspace
- Karnaugh map and simplification panel
- Static CMOS schematic panel
- Review page

## Run Locally

```bash
npm install
npm run dev
```

Then open the Vite local URL shown in the terminal.

## Build

```bash
npm run build
npm run test:formula
```

## Deploy To GitHub Pages

This project is configured with:

```json
"homepage": "https://marksui.github.io/logic-cmos-studio/"
```

Build the app and push the committed `dist/` output to `main`:

```bash
npm run build
git add -A
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

## Why This Project

Boolean logic is the bridge between high-level digital design and transistor-level implementation. This studio connects the flow in one place: a Boolean equation becomes a truth table, the truth table becomes a Karnaugh map, the map becomes simplified SOP/POS equations, the equations become RTL-style Verilog, and the same logic can be inspected as static CMOS pull-up and pull-down networks for VLSI learning.
