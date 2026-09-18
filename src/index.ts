#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  diagnosticClear,
  diagnosticSnapshot,
  diagnosticStart,
  inspectEditor,
  openTinkercad,
} from "./browser.js";

const server = new McpServer({
  name: "TinkerMCP",
  version: "0.2.0",
});

server.tool(
  "tinkercad_open",
  "Open Tinkercad 3D Design in a persistent real browser session.",
  { url: z.string().url().optional() },
  async ({ url }) => ({
    content: [{ type: "text", text: await openTinkercad(url) }],
  }),
);

server.tool(
  "tinkercad_inspect_editor",
  "Inspect visible Tinkercad editor controls and potentially useful page globals.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(await inspectEditor(), null, 2) }],
  }),
);

server.tool(
  "tinkercad_diagnostic_start",
  "Clear previous traces and begin a clean diagnostic capture. Call this immediately before the human performs a Tinkercad action you want to reverse engineer.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(await diagnosticStart(), null, 2) }],
  }),
);

server.tool(
  "tinkercad_diagnostic_snapshot",
  "Return captured user interactions, DOM mutations, and recent network activity from the current Tinkercad page.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(await diagnosticSnapshot(), null, 2) }],
  }),
);

server.tool(
  "tinkercad_diagnostic_clear",
  "Clear captured diagnostic events without closing the Tinkercad browser session.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(await diagnosticClear(), null, 2) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
