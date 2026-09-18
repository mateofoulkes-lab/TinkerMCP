# TinkerMCP

Experimental **Model Context Protocol server for Tinkercad 3D Design**.

The goal is to let an AI operate Tinkercad's 3D editor through a small semantic toolset instead of treating the browser UI itself as the API.

> Status: early prototype / live editor reverse-engineering phase.

## Architecture

AI / MCP client → TinkerMCP → Playwright → persistent real browser → Tinkercad 3D

Tinkercad does not expose a public 3D-design API suitable for this use case, so TinkerMCP works through a real authenticated browser session. The semantic MCP API is deliberately separated from selectors, gestures and UI details.

## Current MCP tools

- `tinkercad_open`
- `tinkercad_inspect_editor`
- `tinkercad_diagnostic_start`
- `tinkercad_diagnostic_snapshot`
- `tinkercad_diagnostic_clear`

The diagnostic recorder captures:

- clicks and pointer actions
- keyboard events
- input/change events
- relevant DOM mutations
- request/response metadata
- interesting editor controls and page globals

This lets us observe one real Tinkercad action at a time and discover the most reliable automation layer instead of hard-coding guesses.

## Reverse-engineering workflow

1. Open Tinkercad with `tinkercad_open`.
2. Log into Autodesk if needed and open a 3D design.
3. Call `tinkercad_inspect_editor` for a baseline.
4. Call `tinkercad_diagnostic_start`.
5. Perform exactly one action in Tinkercad, for example dragging a Box onto the workplane.
6. Call `tinkercad_diagnostic_snapshot`.
7. Compare the trace with the baseline and implement a semantic adapter.
8. Repeat for resize, move, rotate, hole, group, align and export.

## Planned semantic tools

- create primitives (box, cylinder, etc.)
- position, resize and rotate
- solid / hole
- duplicate / delete
- align
- group / ungroup
- workplane
- inspect selection / scene
- export STL

The model should eventually see stable calls such as:

`create_box({ width: 40, depth: 30, height: 12 })`

DOM selectors, pointer gestures, keyboard shortcuts and Tinkercad-specific implementation details stay behind the adapter.

## Setup

```bash
npm install
npx playwright install chromium
npm run build
```

Configure an MCP client to launch:

```bash
node /absolute/path/to/TinkerMCP/dist/index.js
```

The browser uses a persistent profile (`.tinkermcp-profile` by default), so the Autodesk login can survive between runs.

## Inspiration

- `sethski/tinkercad-mcp-server` — community MCP for Tinkercad Circuits using a persistent real browser.
- Model Context Protocol SDK.
- Playwright.

## License

MIT
