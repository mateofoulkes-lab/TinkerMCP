import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";

let context: BrowserContext | undefined;
let page: Page | undefined;

export async function getTinkercadPage(): Promise<Page> {
  if (!context) {
    const userDataDir = path.resolve(process.env.TINKERMCP_PROFILE ?? ".tinkermcp-profile");
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: process.env.TINKERMCP_CHROME_CHANNEL || undefined,
      viewport: null,
    });
  }
  if (!page || page.isClosed()) {
    page = context.pages()[0] ?? await context.newPage();
  }
  return page;
}

export async function openTinkercad(url = "https://www.tinkercad.com/3d-design"): Promise<string> {
  const p = await getTinkercadPage();
  await p.goto(url, { waitUntil: "domcontentloaded" });
  return p.url();
}

export async function inspectEditor(): Promise<unknown> {
  const p = await getTinkercadPage();
  return p.evaluate(() => {
    const interesting = [...document.querySelectorAll("button,[role=button],[aria-label],[data-testid]")]
      .slice(0, 300)
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 120),
        aria: el.getAttribute("aria-label"),
        testid: el.getAttribute("data-testid"),
        title: el.getAttribute("title"),
      }))
      .filter((x) => x.text || x.aria || x.testid || x.title);
    return { title: document.title, url: location.href, elements: interesting };
  });
}
