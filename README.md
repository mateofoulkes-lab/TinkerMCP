# TinkerMCP

Experimental **Model Context Protocol server for Tinkercad 3D Design**.

The goal: let an AI operate Tinkercad's 3D editor through a small semantic toolset instead of treating the browser UI as an API.

> Status: very early prototype / editor-discovery phase.

## Architecture

AI / MCP client → TinkerMCP → remote browser automation → Tinkercad 3D

Tinkercad does not expose a public 3D-design API suitable for this use case, so TinkerMCP automates a real authenticated browser session. The semantic MCP API is intentionally separated from selectors and UI details.

## Planned tools

- create primitives (box, cylinder, etc.)
- position, resize, rotate
- solid / hole
- duplicate / delete
- align
- group / ungroup
- workplane
- inspect selection / scene
- export STL

## Milestone 0 — bootstrap

The first milestone deliberately does not guess Tinkercad selectors. It provides:

- MCP server foundation
- persistent browser profile
- `tinkercad_open`
- `tinkercad_inspect_editor`
- diagnostic capture tools for DOM/input/network observation

## Render deployment

The hosted version will expose MCP over HTTP and is designed to deploy from GitHub automatically. Keep the Render service on the **Free ($0/month)** instance while prototyping.

The repository remains the single source of truth: changes go to `main`, Render auto-deploys, and no manual code copy/paste should be necessary.

## Design principle

The model should see stable operations such as `create_box({width, depth, height})`. DOM selectors, drag mechanics, keyboard shortcuts and Tinkercad-specific implementation details stay behind the adapter.

## Inspiration

- sethski/tinkercad-mcp-server — community MCP for Tinkercad Circuits using a persistent browser.
- Model Context Protocol.
- Playwright / remote browser automation.

## License

MIT
