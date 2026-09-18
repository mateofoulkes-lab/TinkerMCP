#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { inspectEditor, openTinkercad } from "./browser.js";

const server = new McpServer({
  name: "TinkerMCP",
  version: "0.1.0",
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
  "Inspect visible Tinkercad editor controls. This discovery tool helps us build robust 3D actions without hard-coding guesses.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(await inspectEditor(), null, 2) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
