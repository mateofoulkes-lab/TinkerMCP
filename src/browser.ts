import { chromium, type BrowserContext, type Page, type Request, type Response } from "playwright";
import path from "node:path";
import os from "node:os";

let context: BrowserContext | undefined;
let page: Page | undefined;
let diagnosticsAttached = false;
let screenshotInFlight: Promise<Buffer> | undefined;

const networkLog: Array<Record<string, unknown>> = [];
const MAX_NETWORK_EVENTS = 400;

function pushNetwork(entry: Record<string, unknown>) {
  networkLog.push({ ts: new Date().toISOString(), ...entry });
  if (networkLog.length > MAX_NETWORK_EVENTS) networkLog.shift();
}

function summarizeRequest(request: Request) {
  const url = request.url();
  let postData = request.postData() ?? undefined;
  if (postData && postData.length > 2000) postData = `${postData.slice(0, 2000)}…`;
  return { kind: "request", method: request.method(), resourceType: request.resourceType(), url, postData };
}

function summarizeResponse(response: Response) {
  const request = response.request();
  return { kind: "response", status: response.status(), method: request.method(), resourceType: request.resourceType(), url: response.url() };
}

async function attachDiagnostics(p: Page) {
  if (diagnosticsAttached) return;
  diagnosticsAttached = true;

  p.on("request", (request) => pushNetwork(summarizeRequest(request)));
  p.on("response", (response) => pushNetwork(summarizeResponse(response)));
  p.on("requestfailed", (request) => pushNetwork({ kind: "requestfailed", method: request.method(), resourceType: request.resourceType(), url: request.url(), failure: request.failure() }));

  await p.addInitScript(() => {
    const w = window as Window & {
      __tinkerMcpEvents?: Array<Record<string, unknown>>;
      __tinkerMcpMutations?: Array<Record<string, unknown>>;
      __tinkerMcpDiagnosticInstalled?: boolean;
    };

    if (w.__tinkerMcpDiagnosticInstalled) return;
    w.__tinkerMcpDiagnosticInstalled = true;
    w.__tinkerMcpEvents = [];
    w.__tinkerMcpMutations = [];

    const cap = (arr: Array<Record<string, unknown>>, item: Record<string, unknown>, max = 500) => {
      arr.push(item);
      if (arr.length > max) arr.shift();
    };

    const describe = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const rect = target.getBoundingClientRect();
      return {
        tag: target.tagName,
        id: target.id || null,
        className: typeof target.className === "string" ? target.className.slice(0, 300) : null,
        text: (target.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200),
        aria: target.getAttribute("aria-label"),
        title: target.getAttribute("title"),
        role: target.getAttribute("role"),
        testid: target.getAttribute("data-testid"),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      };
    };

    const record = (event: Event) => {
      if (!w.__tinkerMcpEvents) return;
      const base: Record<string, unknown> = { ts: Date.now(), type: event.type, target: describe(event.target) };
      if (event instanceof PointerEvent || event instanceof MouseEvent) {
        base.x = event.clientX;
        base.y = event.clientY;
        base.button = event.button;
      }
      if (event instanceof KeyboardEvent) {
        base.key = event.key;
        base.code = event.code;
        base.ctrl = event.ctrlKey;
        base.alt = event.altKey;
        base.shift = event.shiftKey;
        base.meta = event.metaKey;
      }
      if (event instanceof InputEvent) {
        const el = event.target as HTMLInputElement | null;
        base.value = el?.type === "password" ? "<redacted>" : el?.value?.slice?.(0, 300);
        base.inputType = event.inputType;
      }
      cap(w.__tinkerMcpEvents, base);
    };

    for (const type of ["click", "pointerdown", "pointerup", "keydown", "input", "change"]) {
      document.addEventListener(type, record, true);
    }

    const observer = new MutationObserver((records) => {
      if (!w.__tinkerMcpMutations) return;
      for (const mutation of records) {
        const target = mutation.target instanceof Element ? describe(mutation.target) : null;
        const item: Record<string, unknown> = { ts: Date.now(), type: mutation.type, target };
        if (mutation.type === "attributes") item.attribute = mutation.attributeName;
        if (mutation.type === "childList") {
          item.added = mutation.addedNodes.length;
          item.removed = mutation.removedNodes.length;
        }
        cap(w.__tinkerMcpMutations, item);
      }
    });

    const installObserver = () => {
      if (!document.documentElement) return setTimeout(installObserver, 10);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style", "aria-label", "aria-selected", "aria-pressed", "value"],
      });
    };
    installObserver();
  });
}

function isHeadless() {
  return process.env.TINKERMCP_HEADLESS === "true" || !!process.env.RENDER;
}

export async function getTinkercadPage(): Promise<Page> {
  if (!context) {
    const userDataDir = path.resolve(process.env.TINKERMCP_PROFILE ?? path.join(os.tmpdir(), "tinkermcp-profile"));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: isHeadless(),
      viewport: { width: 1440, height: 1000 },
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--enable-webgl", "--use-gl=swiftshader"],
    });
  }

  if (!page || page.isClosed()) {
    const usable = context.pages().find((p) => !p.isClosed());
    page = usable ?? (await context.newPage());
    diagnosticsAttached = false;
  }

  await attachDiagnostics(page);
  return page;
}

export async function browserCheck(): Promise<unknown> {
  const started = Date.now();
  const p = await getTinkercadPage();
  await p.goto("https://www.tinkercad.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  return p.evaluate((elapsed) => ({
    ok: true,
    url: location.href,
    title: document.title,
    userAgent: navigator.userAgent,
    webdriver: navigator.webdriver,
    webgl: (() => {
      try {
        const canvas = document.createElement("canvas");
        return !!(canvas.getContext("webgl") || canvas.getContext("webgl2"));
      } catch { return false; }
    })(),
    elapsedMs: elapsed,
  }), Date.now() - started);
}

async function captureRemoteScreenshot(): Promise<Buffer> {
  let p = await getTinkercadPage();
  try {
    return await p.screenshot({ type: "jpeg", quality: 60, timeout: 15000 });
  } catch (firstError) {
    if (!context) throw firstError;
    const usable = context.pages().filter((candidate) => !candidate.isClosed());
    p = usable[usable.length - 1] ?? (await context.newPage());
    page = p;
    diagnosticsAttached = false;
    await attachDiagnostics(p);
    return await p.screenshot({ type: "jpeg", quality: 55, timeout: 15000 });
  }
}

export async function remoteScreenshot(): Promise<Buffer> {
  if (!screenshotInFlight) {
    screenshotInFlight = captureRemoteScreenshot().finally(() => {
      screenshotInFlight = undefined;
    });
  }
  return screenshotInFlight;
}

export async function remoteStatus(): Promise<unknown> {
  const p = await getTinkercadPage();
  return { url: p.url(), title: await p.title() };
}

export async function remoteNavigate(url: string): Promise<unknown> {
  const p = await getTinkercadPage();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  return remoteStatus();
}

export async function remoteClick(x: number, y: number): Promise<unknown> {
  const p = await getTinkercadPage();
  await p.mouse.click(x, y);
  await p.waitForTimeout(300);
  return remoteStatus();
}

export async function remoteType(text: string): Promise<unknown> {
  const p = await getTinkercadPage();
  await p.keyboard.type(text, { delay: 15 });
  return remoteStatus();
}

export async function remoteKey(key: string): Promise<unknown> {
  const p = await getTinkercadPage();
  await p.keyboard.press(key);
  await p.waitForTimeout(200);
  return remoteStatus();
}

export async function openTinkercad(url = "https://www.tinkercad.com/3d-design"): Promise<string> {
  const p = await getTinkercadPage();
  await p.goto(url, { waitUntil: "domcontentloaded" });
  return p.url();
}

export async function inspectEditor(): Promise<unknown> {
  const p = await getTinkercadPage();
  return p.evaluate(() => {
    const interesting = [...document.querySelectorAll("button,[role=button],[aria-label],[data-testid],input")]
      .slice(0, 500)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
          aria: el.getAttribute("aria-label"),
          testid: el.getAttribute("data-testid"),
          title: el.getAttribute("title"),
          role: el.getAttribute("role"),
          id: el.id || null,
          className: typeof el.className === "string" ? el.className.slice(0, 250) : null,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        };
      })
      .filter((x) => x.text || x.aria || x.testid || x.title || x.role);

    const globals = Object.keys(window).filter((key) => /tinker|editor|design|shape|workspace|scene|redux|store|three/i.test(key)).slice(0, 200);
    return { title: document.title, url: location.href, readyState: document.readyState, elements: interesting, interestingGlobals: globals };
  });
}

export async function diagnosticStart(): Promise<unknown> {
  const p = await getTinkercadPage();
  networkLog.length = 0;
  return p.evaluate(() => {
    const w = window as Window & { __tinkerMcpEvents?: Array<Record<string, unknown>>; __tinkerMcpMutations?: Array<Record<string, unknown>> };
    if (w.__tinkerMcpEvents) w.__tinkerMcpEvents.length = 0;
    if (w.__tinkerMcpMutations) w.__tinkerMcpMutations.length = 0;
    return { ok: true, url: location.href, startedAt: new Date().toISOString() };
  });
}

export async function diagnosticSnapshot(): Promise<unknown> {
  const p = await getTinkercadPage();
  const browserState = await p.evaluate(() => {
    const w = window as Window & { __tinkerMcpEvents?: Array<Record<string, unknown>>; __tinkerMcpMutations?: Array<Record<string, unknown>> };
    return { url: location.href, title: document.title, events: [...(w.__tinkerMcpEvents ?? [])], mutations: [...(w.__tinkerMcpMutations ?? [])] };
  });
  return { ...browserState, network: [...networkLog] };
}

export async function diagnosticClear(): Promise<unknown> {
  const p = await getTinkercadPage();
  networkLog.length = 0;
  await p.evaluate(() => {
    const w = window as Window & { __tinkerMcpEvents?: Array<Record<string, unknown>>; __tinkerMcpMutations?: Array<Record<string, unknown>> };
    if (w.__tinkerMcpEvents) w.__tinkerMcpEvents.length = 0;
    if (w.__tinkerMcpMutations) w.__tinkerMcpMutations.length = 0;
  });
  return { ok: true };
}
