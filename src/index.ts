#!/usr/bin/env node
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  diagnosticClear,
  diagnosticSnapshot,
  diagnosticStart,
  inspectEditor,
  openTinkercad,
} from "./browser.js";

function createMcpServer() {
  const server = new McpServer({
    name: "TinkerMCP",
    version: "0.3.0",
  });

  server.tool(
    "tinkercad_open",
    "Open Tinkercad 3D Design in the configured browser session.",
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

  return server;
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.type("text/plain").send("TinkerMCP is running. MCP endpoint: /mcp\n");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "TinkerMCP", version: "0.3.0" });
});

app.all("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`TinkerMCP listening on port ${port}`);
});
