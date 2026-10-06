/**
 * Example game-rig config, written for Bake Shop (~/src/bake-shop) without changing the game.
 * Copy to the game repo root as game-rig.config.ts, then: ~/src/skills/game-rig/bin/game-rig.mjs check
 * Only the setup steps and selectors are game-specific; everything else is the rig's.
 */
import type { GameRigInput, RigContext } from "../src/config.ts";

const BAKE_URL = process.env.BAKE_URL ?? "http://localhost:8795";

/** Hosts a room on a TV device and returns its code. On the "tv" role the screen's own page is the TV. */
async function hostRoom(rig: RigContext) {
  const tv = rig.role === "tv" ? rig.page : await rig.open("tv");
  await tv.goto(new URL("/?as=tv&seed=2026", rig.baseUrl).href);
  const start = tv.getByRole("button", { name: /Start the TV/ });
  if (await start.count()) await start.click();
  const code = ((await tv.locator(".code").first().textContent()) ?? "").trim();
  return { tv, code };
}

async function join(rig: RigContext, role: string, seat: "grown-up" | "kid" | "little kid", code: string) {
  const page = rig.role === role ? rig.page : await rig.open(role);
  await page.goto(new URL(`/join/${code}`, rig.baseUrl).href);
  await page.getByRole("button", { name: seat, exact: true }).dispatchEvent("pointerdown");
  return page;
}

/** Everyone in, shop open: the first customer's order is on every screen. */
async function shopOpen(rig: RigContext) {
  const { code } = await hostRoom(rig);
  const mom = await join(rig, "mom", "grown-up", code);
  await join(rig, "kid", "kid", code);
  await mom.getByRole("button", { name: "Open the shop!" }).click();
  await rig.wait(2500);
}

/** A TV scene from the preview page, held on a named trailer beat. */
const scenario = (name: string): GameRigInput["screens"] extends (infer S)[] | undefined ? S : never => ({
  name: `scene-${name}`,
  role: "tv",
  path: `/preview.html?scenario=${name}&hold=1`,
  setup: async ({ page }) => {
    await page.waitForFunction(() => Reflect.get(window, "__bakeShop")?.reached === true, null, { timeout: 120_000 });
  },
  checks: ["overlay", "text", "safe-area"],
  settleMs: 1500,
});

const config: GameRigInput = {
  name: "Bake Shop",
  baseUrl: BAKE_URL,
  roles: {
    tv: { kind: "tv", label: "TV" },
    mom: { kind: "phone", label: "Grown-up phone" },
    kid: { kind: "tablet", label: "Baker iPad (age 5)" },
  },
  // The game has no window.__focalRect yet: stand in with the middle of the screen until it does.
  focal: "window.__focalRect?.() ?? ({ x: innerWidth * 0.25, y: innerHeight * 0.2, width: innerWidth * 0.5, height: innerHeight * 0.6 })",
  chromeArgs: ["--use-angle=metal", "--ignore-gpu-blocklist"],
  maxTapsPerScreen: 8,
  // The kid's picture keys are divs with pointerdown handlers, not buttons.
  tapSelector: "button, [role=button], [data-key]",
  screens: [
    { name: "tv-start-gate", role: "tv", path: "/?as=tv&seed=2026", checks: ["text", "safe-area"], focal: false },
    { name: "tv-lobby", role: "tv", setup: async (rig) => void (await hostRoom(rig)), checks: ["overlay", "text", "safe-area"] },
    { name: "phone-pick-seat", role: "mom", setup: async (rig) => { const { code } = await hostRoom(rig); await rig.page.goto(new URL(`/join/${code}`, rig.baseUrl).href); }, focal: false },
    { name: "ipad-pick-seat", role: "kid", setup: async (rig) => { const { code } = await hostRoom(rig); await rig.page.goto(new URL(`/join/${code}`, rig.baseUrl).href); }, focal: false },
    { name: "phone-shop-open", role: "mom", setup: shopOpen, focal: false },
    { name: "ipad-first-order", role: "kid", setup: shopOpen, focal: false },
    {
      name: "ipad-base-station",
      role: "kid",
      setup: async (rig) => {
        await shopOpen(rig);
        await rig.page.locator("[data-key]").first().waitFor({ timeout: 30_000 });
      },
      focal: false,
      checks: ["text", "tap"],
    },
    { name: "tv-first-customer", role: "tv", setup: shopOpen, checks: ["overlay", "text", "safe-area"] },
    scenario("customer-arrives"),
    scenario("oven-ding"),
    scenario("taste-celebrate"),
  ],
  session: async (rig) => {
    const { tv, mom, kid } = rig.pages;
    if (!tv || !mom || !kid) throw new Error("roles missing");
    await tv.goto(`${rig.baseUrl}/?as=tv&seed=2026`);
    await tv.getByRole("button", { name: /Start the TV/ }).click();
    const code = ((await tv.locator(".code").textContent()) ?? "").trim();
    rig.mark("tv up");
    await rig.wait(1500);
    await mom.goto(`${rig.baseUrl}/join/${code}`);
    await mom.getByRole("button", { name: "grown-up" }).dispatchEvent("pointerdown");
    await kid.goto(`${rig.baseUrl}/join/${code}`);
    await kid.getByRole("button", { name: "kid", exact: true }).dispatchEvent("pointerdown");
    rig.mark("everyone joined");
    await rig.wait(1500);
    await mom.getByRole("button", { name: "Open the shop!" }).click();
    rig.mark("open the shop");
    await rig.wait(8000);
    rig.mark("first customer");
  },
};
export default config;
