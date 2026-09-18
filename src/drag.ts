import { getTinkercadPage } from "./browser.js";

export async function remoteDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps = 24,
): Promise<unknown> {
  const p = await getTinkercadPage();
  await p.mouse.move(fromX, fromY);
  await p.mouse.down();
  await p.mouse.move(toX, toY, { steps: Math.max(2, Math.min(100, steps)) });
  await p.mouse.up();
  await p.waitForTimeout(700);
  return { url: p.url(), title: await p.title() };
}
