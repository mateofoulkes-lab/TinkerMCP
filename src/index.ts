#!/usr/bin/env node
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  browserCheck,
  diagnosticClear,
  diagnosticSnapshot,
  diagnosticStart,
  inspectEditor,
  openTinkercad,
  remoteClick,
  remoteKey,
  remoteNavigate,
  remoteScreenshot,
  remoteStatus,
  remoteType,
} from "./browser.js";

function createMcpServer() {
  const server = new McpServer({ name: "TinkerMCP", version: "0.5.1" });

  server.tool("tinkercad_open", "Open Tinkercad 3D Design in the configured browser session.", { url: z.string().url().optional() }, async ({ url }) => ({ content: [{ type: "text", text: await openTinkercad(url) }] }));
  server.tool("tinkercad_browser_check", "Smoke-test the hosted browser and WebGL support by opening the Tinkercad home page.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(await browserCheck(), null, 2) }] }));
  server.tool("tinkercad_inspect_editor", "Inspect visible Tinkercad editor controls and potentially useful page globals.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(await inspectEditor(), null, 2) }] }));
  server.tool("tinkercad_diagnostic_start", "Clear previous traces and begin a clean diagnostic capture.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(await diagnosticStart(), null, 2) }] }));
  server.tool("tinkercad_diagnostic_snapshot", "Return captured user interactions, DOM mutations, and recent network activity from the current Tinkercad page.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(await diagnosticSnapshot(), null, 2) }] }));
  server.tool("tinkercad_diagnostic_clear", "Clear captured diagnostic events without closing the Tinkercad browser session.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(await diagnosticClear(), null, 2) }] }));

  return server;
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => res.type("text/plain").send("TinkerMCP is running. MCP endpoint: /mcp\nBrowser smoke test: /browser-check\nRemote browser: /remote\n"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "TinkerMCP", version: "0.5.1" }));

app.get("/browser-check", async (_req, res) => {
  try { res.json(await browserCheck()); }
  catch (error) { res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/remote/screenshot.jpg", async (_req, res) => {
  try {
    const image = await remoteScreenshot();
    res.set("Cache-Control", "no-store");
    res.type("image/jpeg").send(image);
  } catch (error) { res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/remote/status", async (_req, res) => {
  try {
    let status = await remoteStatus();
    if ((status as { url?: string }).url === "about:blank") {
      await remoteNavigate("https://www.tinkercad.com/");
      status = await remoteStatus();
    }
    res.json(status);
  } catch (error) { res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.post("/remote/navigate", async (req, res) => {
  try { res.json(await remoteNavigate(String(req.body?.url || "https://www.tinkercad.com/"))); }
  catch (error) { res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/remote/click", async (req, res) => {
  try { res.json(await remoteClick(Number(req.body?.x), Number(req.body?.y))); }
  catch (error) { res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/remote/type", async (req, res) => {
  try { res.json(await remoteType(String(req.body?.text ?? ""))); }
  catch (error) { res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/remote/key", async (req, res) => {
  try { res.json(await remoteKey(String(req.body?.key || "Enter"))); }
  catch (error) { res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/remote", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TinkerMCP Remote</title>
<style>
body{margin:0;background:#101214;color:#eee;font-family:system-ui,Arial,sans-serif}.bar{position:sticky;top:0;z-index:10;background:#171a1d;padding:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #333}input,button{font:inherit;padding:8px 10px;border-radius:7px;border:1px solid #444;background:#222;color:#eee}button{cursor:pointer}.url{flex:1;min-width:280px}.text{min-width:280px}.status{font-size:12px;color:#aaa}.wrap{padding:12px;overflow:auto}.screen{display:block;max-width:100%;height:auto;border:1px solid #333;cursor:crosshair;background:#000}small{color:#aaa}
</style></head><body>
<div class="bar">
<input id="url" class="url" value="https://www.tinkercad.com/">
<button onclick="nav()">Ir</button>
<button onclick="key('Tab')">Tab</button>
<button onclick="key('Enter')">Enter</button>
<button onclick="key('Escape')">Esc</button>
<input id="text" class="text" placeholder="Escribir en el campo activo">
<button onclick="typeText()">Escribir</button>
<span id="status" class="status">cargando…</span>
</div>
<div class="wrap"><img id="screen" class="screen" src="/remote/screenshot.jpg?t=0" alt="browser"><br><small>Hacé clic sobre la imagen para hacer clic en el navegador remoto. La imagen se actualiza automáticamente.</small></div>
<script>
const screen=document.getElementById('screen');
const statusEl=document.getElementById('status');
const urlEl=document.getElementById('url');
let editingUrl=false;
urlEl.addEventListener('focus',()=>editingUrl=true);
urlEl.addEventListener('blur',()=>editingUrl=false);
urlEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nav();}});
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());return r.json()}
function refresh(){
  screen.src='/remote/screenshot.jpg?t='+Date.now();
  fetch('/remote/status').then(r=>r.json()).then(s=>{
    statusEl.textContent=(s.title||'')+' — '+(s.url||'');
    if(s.url && !editingUrl) urlEl.value=s.url;
  }).catch(()=>{});
}
async function nav(){editingUrl=false;urlEl.blur();await api('/remote/navigate',{url:urlEl.value});refresh()}
async function typeText(){const el=document.getElementById('text');await api('/remote/type',{text:el.value});el.value='';refresh()}
async function key(k){await api('/remote/key',{key:k});refresh()}
screen.addEventListener('click',async e=>{const r=screen.getBoundingClientRect();const x=(e.clientX-r.left)*screen.naturalWidth/r.width;const y=(e.clientY-r.top)*screen.naturalHeight/r.height;await api('/remote/click',{x,y});setTimeout(refresh,250)});
setInterval(refresh,1800);refresh();
</script></body></html>`);
});

app.all("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on("close", () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`TinkerMCP listening on port ${port}`));
