/**
 * The one per-game file: `game-rig.config.ts` in the game repo. Everything game-specific lives
 * here (URLs, roles, how to reach each screen, the bot that plays a session); the rig is generic.
 */
import { pathToFileURL } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
import { z } from "zod";
import { DEFAULT_FOCAL } from "./page/probe.ts";

export type Viewport = { width: number; height: number; label?: string };

export const DEFAULT_VIEWPORTS: Record<RoleKind, Viewport[]> = {
  tv: [
    { width: 1920, height: 1080, label: "tv-1080p" },
    { width: 1280, height: 720, label: "tv-720p" },
  ],
  // iPad in landscape at 4:3 (iPad 9th gen / Air 2 and the Pro 12.9").
  tablet: [
    { width: 1080, height: 810, label: "ipad-1080x810" },
    { width: 1024, height: 768, label: "ipad-1024x768" },
    { width: 1366, height: 1024, label: "ipad-pro-1366x1024" },
  ],
  phone: [
    { width: 393, height: 852, label: "iphone-393x852" },
    { width: 375, height: 667, label: "iphone-se-375x667" },
    { width: 393, height: 659, label: "iphone-safari-393x659" },
    { width: 852, height: 393, label: "iphone-land-852x393" },
  ],
};

export const CHECKS = ["overlay", "text", "tap", "safe-area"] as const;
export type CheckName = (typeof CHECKS)[number];
export type RoleKind = "tv" | "tablet" | "phone";

/** What a screen's `setup` and the session bot get to drive the game. */
export type RigContext = {
  page: Page;
  role: string;
  baseUrl: string;
  viewport: Viewport;
  browser: Browser;
  /** Another device in the same room (a fresh context at its role's first viewport). */
  open: (role: string, path?: string) => Promise<Page>;
  wait: (ms: number) => Promise<void>;
};
export type SetupFn = (ctx: RigContext) => Promise<void>;

export type SessionRig = {
  /** Pages for every role, already recording, blank until the bot navigates them. */
  pages: Record<string, Page>;
  baseUrl: string;
  mark: (label: string) => void;
  wait: (ms: number) => Promise<void>;
  /** Start the TV audio capture now (after the game's first user gesture, e.g. "Start the TV"). */
  startAudio: (role?: string) => Promise<void>;
};
export type SessionFn = (rig: SessionRig) => Promise<void>;

const fn = <T>(what: string) => z.custom<T>((v) => typeof v === "function", { message: `${what} must be a function` });

const ViewportSchema = z.object({ width: z.number().int().positive(), height: z.number().int().positive(), label: z.string().optional() });

const Role = z.object({
  kind: z.enum(["tv", "tablet", "phone"]),
  label: z.string().optional(),
  viewports: z.array(ViewportSchema).optional(),
  /** Not recorded in the session video (e.g. the toddler's phone, off camera). */
  offCamera: z.boolean().default(false),
});

const Screen = z.object({
  name: z.string().regex(/^[\w.-]+$/, "screen names become file names: letters, digits, - _ ."),
  role: z.string(),
  path: z.string().optional(),
  setup: fn<SetupFn>("screen.setup").optional(),
  checks: z.array(z.enum(CHECKS)).default([...CHECKS]),
  /** false: this screen has no 3D scene, so there is no focal rect to protect. */
  focal: z.boolean().default(true),
  viewports: z.array(ViewportSchema).optional(),
  settleMs: z.number().default(600),
});

const Ignore = z.object({
  overlay: z.array(z.string()).default([]),
  text: z.array(z.string()).default([]),
  tap: z.array(z.string()).default([]),
  safeArea: z.array(z.string()).default([]),
});

export const ConfigSchema = z
  .object({
    name: z.string(),
    baseUrl: z.string().url(),
    roles: z.record(z.string(), Role),
    screens: z.array(Screen).default([]),
    focal: z.string().default(DEFAULT_FOCAL),
    ignore: Ignore.default({ overlay: [], text: [], tap: [], safeArea: [] }),
    allowRepeatedLabels: z.array(z.string()).default([]),
    holdSelector: z.string().optional(),
    /** Controls for the tap check; add the game's own (e.g. "button, [role=button], [data-key]"). */
    tapSelector: z.string().default("button, [role=button]"),
    safeAreaInset: z.number().min(0).max(0.2).default(0.05),
    maxTapsPerScreen: z.number().int().positive().default(12),
    /** Chrome flags for WebGL games (e.g. ["--use-angle=metal", "--ignore-gpu-blocklist"]). */
    chromeArgs: z.array(z.string()).default([]),
    session: fn<SessionFn>("session").optional(),
    /** Expression in the TV page returning the game's master-bus MediaStream; default: the rig's Web Audio tap. */
    audioTap: z.string().optional(),
    /** Role whose audio goes into the session video. */
    audioRole: z.string().optional(),
    record: z
      .object({ out: z.string().default("recordings/latest.mp4"), height: z.number().default(720), expectSpeech: z.string().optional() })
      .default({ out: "recordings/latest.mp4", height: 720 }),
  })
  .superRefine((c, ctx) => {
    for (const s of c.screens)
      if (!(s.role in c.roles)) ctx.addIssue({ code: "custom", message: `screen "${s.name}" uses unknown role "${s.role}" (roles: ${Object.keys(c.roles).join(", ")})` });
  });

export type GameRigInput = z.input<typeof ConfigSchema>;
export type GameRigConfig = z.output<typeof ConfigSchema>;

/** Identity helper so a game's config gets types: `export default defineConfig({...})`. */
export const defineConfig = (c: GameRigInput): GameRigInput => c;

export function parseConfig(raw: unknown, env: Record<string, string | undefined> = process.env): GameRigConfig {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`game-rig config: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return env.GAME_RIG_URL ? { ...parsed.data, baseUrl: env.GAME_RIG_URL } : parsed.data;
}

export async function loadConfig(file: string): Promise<GameRigConfig> {
  const mod: unknown = await import(pathToFileURL(file).href);
  const Module = z.object({ default: z.unknown() });
  return parseConfig(Module.parse(mod).default);
}

export function viewportsFor(c: GameRigConfig, role: string, screen?: { viewports?: Viewport[] }): Viewport[] {
  const r = c.roles[role];
  if (!r) throw new Error(`unknown role ${role}`);
  return screen?.viewports ?? r.viewports ?? DEFAULT_VIEWPORTS[r.kind];
}

export type { BrowserContext };
