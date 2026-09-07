/* The rooms a deck can hang in.

   A "theme" here is not a colour: it is a whole room — what the wall is
   made of, what the floor is, how warm the light is, what paper and
   ink a card gets when the author says nothing, and what the chrome
   around the wall is coloured. Each of those decides the others; a
   cool white gallery wants concrete underfoot and steel pins, a dark
   wall wants chalk for its headings and warmer dust in its one spot of
   light. So a room is chosen whole, by name, and everything that draws
   the scene reads its colours from here rather than carrying its own.

   Three rooms. They are meant to be told apart at a glance and to each
   be one coherent place; a fourth belongs here only if it is too. */

import type { PaperName } from "./textures/papers.js";

export type RoomName = "plaster" | "studio" | "night";
export const ROOMS: readonly RoomName[] = ["plaster", "studio", "night"];

/* The few things a deck may turn on a room without leaving it: the
   tint of the wall, what is underfoot, and how warm the light is. Each
   is bounded so the room stays one coherent place — a wall tint stays
   plaster, a floor is one of the floors the rooms know. */
export type FloorKind = "oak" | "concrete" | "none";
export const FLOORS: readonly FloorKind[] = ["oak", "concrete", "none"];
export type LightKind = "warm" | "cool";
export const LIGHTS: readonly LightKind[] = ["warm", "cool"];
export interface Knobs {
  /** The plaster's tint, `#rrggbb`. Tamed to stay plaster. */
  wall?: string;
  floor?: FloorKind;
  light?: LightKind;
}

export interface Room {
  name: RoomName;
  /** What shows past the wall's edges, and what the far end fades into. */
  background: string;
  fog: number;
  /** The plaster: its base, the light and dark blotches worked into it,
      the cracks, and the block joints — or none, for a wall that was
      never stone. */
  plaster: {
    base: string;
    light: string;
    dark: string;
    cracks: string;
    seams: boolean;
    seam: string;
    seamLight: string;
    bump: number;
  };
  floor: {
    kind: FloorKind;
    /** The texture's own colour, and the tint the material lays over it. */
    base: string;
    tint: number;
  };
  skirting: number;
  /** The colour the baked contact shading is made of, as "r,g,b". */
  contact: string;
  light: {
    sky: number;
    ground: number;
    ambient: number;
    key: number;
    keyStrength: number;
    fill: number;
    fillStrength: number;
    exposure: number;
  };
  dust: { color: number; opacity: number };
  /** What a card gets when the author says nothing. */
  paper: { stock: PaperName; ink: string; paint: string; pin: number };
  /** What the deck turned on this room, on top of the preset. */
  knobs: Knobs;
  /** The chrome around the wall: loader, hints, the text version. */
  chrome: {
    cream: string;
    ink: string;
    inkSoft: string;
    line: string;
    accent: string;
    /** The panel's surface, a field's surface, and the colour of a warning. */
    panel: string;
    field: string;
    bad: string;
    scheme: "light" | "dark";
  };
}

const plaster: Room = {
  name: "plaster",
  knobs: {},
  background: "#ddd4c2",
  fog: 0xd7cdb9,
  plaster: {
    base: "#cbbfab",
    light: "rgba(255,248,232,.10)",
    dark: "rgba(120,100,70,.10)",
    cracks: "rgba(90,72,50,.15)",
    seams: true,
    seam: "rgba(80,64,44,.38)",
    seamLight: "rgba(255,248,230,.30)",
    bump: 0.4,
  },
  floor: { kind: "oak", base: "#a57f55", tint: 0xa8825c },
  skirting: 0xe9e1cf,
  contact: "40,30,18",
  light: {
    sky: 0xfff4e2,
    ground: 0x8d7d64,
    ambient: 0.8,
    key: 0xfff1dc,
    keyStrength: 0.95,
    fill: 0xffd9ad,
    fillStrength: 0.22,
    exposure: 1.04,
  },
  dust: { color: 0xfff3dd, opacity: 0.35 },
  paper: { stock: "classic", ink: "#463a2b", paint: "#6d5334", pin: 0x9a7b3f },
  chrome: {
    cream: "#efe9df",
    ink: "#2b241c",
    inkSoft: "#6f655a",
    line: "#e2dacc",
    accent: "#d97a3f",
    panel: "rgba(250, 247, 241, 0.95)",
    field: "#ffffff",
    bad: "#b0472c",
    scheme: "light",
  },
};

/* A gallery: a white wall that was painted, not built; concrete
   underfoot; even, cool light; steel where the plaster had brass. */
const studio: Room = {
  name: "studio",
  knobs: {},
  background: "#e6e5e1",
  fog: 0xdedcd8,
  plaster: {
    base: "#e9e7e2",
    light: "rgba(255,255,255,.14)",
    dark: "rgba(110,110,105,.07)",
    cracks: "rgba(0,0,0,0)",
    seams: false,
    seam: "rgba(0,0,0,0)",
    seamLight: "rgba(0,0,0,0)",
    bump: 0.18,
  },
  floor: { kind: "concrete", base: "#a3a29e", tint: 0xb9b7b2 },
  skirting: 0xf3f2ef,
  contact: "36,36,34",
  light: {
    sky: 0xf6f8fc,
    ground: 0x8e9197,
    ambient: 0.92,
    key: 0xf8f9fd,
    keyStrength: 0.88,
    fill: 0xe8eef7,
    fillStrength: 0.2,
    exposure: 1.06,
  },
  dust: { color: 0xffffff, opacity: 0.16 },
  paper: { stock: "classic", ink: "#2f3137", paint: "#2b2f36", pin: 0x5d6570 },
  chrome: {
    cream: "#f3f2ef",
    ink: "#26282c",
    inkSoft: "#6a6d73",
    line: "#dedcd7",
    accent: "#2f5d8a",
    panel: "rgba(247, 247, 245, 0.95)",
    field: "#ffffff",
    bad: "#b0472c",
    scheme: "light",
  },
};

/* After dark: a charcoal wall under one warm spot, the boards gone
   dark with it, dust caught in the beam. Headings are chalk, because
   ochre on charcoal is nothing. Paper stays paper — a white card on a
   dark wall is the most legible thing in the room. */
const night: Room = {
  name: "night",
  knobs: {},
  background: "#1e1c1a",
  fog: 0x23211e,
  plaster: {
    base: "#3b3936",
    light: "rgba(255,240,220,.06)",
    dark: "rgba(0,0,0,.14)",
    cracks: "rgba(0,0,0,.22)",
    seams: true,
    seam: "rgba(0,0,0,.4)",
    seamLight: "rgba(255,240,220,.07)",
    bump: 0.5,
  },
  floor: { kind: "oak", base: "#5a4633", tint: 0x6b5440 },
  skirting: 0x2f2c29,
  contact: "0,0,0",
  light: {
    sky: 0xfff0dd,
    ground: 0x1a1714,
    ambient: 0.34,
    key: 0xffd9a8,
    keyStrength: 1.35,
    fill: 0xffb877,
    fillStrength: 0.26,
    exposure: 1.0,
  },
  dust: { color: 0xffe7c4, opacity: 0.5 },
  paper: { stock: "classic", ink: "#3a2f22", paint: "#efe3c6", pin: 0xc9a25a },
  chrome: {
    cream: "#1e1c1a",
    ink: "#efe9df",
    inkSoft: "#a89e90",
    line: "#3a352f",
    accent: "#e28b5c",
    panel: "rgba(33, 30, 27, 0.95)",
    field: "#2b2825",
    bad: "#e07a5f",
    scheme: "dark",
  },
};

const BY_NAME: Record<RoomName, Room> = { plaster, studio, night };

export const isRoomName = (v: unknown): v is RoomName =>
  typeof v === "string" && (ROOMS as readonly string[]).includes(v);

/** The room called `name` — plaster, if there is no such room. */
export const roomNamed = (name?: RoomName): Room =>
  (name && BY_NAME[name]) || plaster;

/* ------------------------------------------------------------------
   The knobs
------------------------------------------------------------------ */

/* The floors and the lights the rooms know, in a version for a light
   room and one for a dark room — concrete under a charcoal wall is not
   the concrete of a white gallery. */
const FLOOR_OF: Record<Exclude<FloorKind, "none">, Record<"light" | "dark", { base: string; tint: number }>> = {
  oak: {
    light: { base: "#a57f55", tint: 0xa8825c },
    dark: { base: "#5a4633", tint: 0x6b5440 },
  },
  concrete: {
    light: { base: "#a3a29e", tint: 0xb9b7b2 },
    dark: { base: "#45433f", tint: 0x57544f },
  },
};
const LIGHT_OF: Record<LightKind, { sky: number; ground: number; key: number; fill: number; dust: number }> = {
  warm: { sky: 0xfff4e2, ground: 0x8d7d64, key: 0xfff1dc, fill: 0xffd9ad, dust: 0xfff3dd },
  cool: { sky: 0xf6f8fc, ground: 0x8e9197, key: 0xf8f9fd, fill: 0xe8eef7, dust: 0xffffff },
};

/** What each room has by nature — a knob set to this is no knob at all. */
export function naturalKnobs(name: RoomName): Required<Pick<Knobs, "floor" | "light">> {
  const r = BY_NAME[name];
  return { floor: r.floor.kind, light: r.light.sky === LIGHT_OF.cool.sky ? "cool" : "warm" };
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, sat, l];
}
function hslToHex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** A wall tint, kept plaster: its hue is the author's, its saturation
    is held to what a wall will take, and its lightness stays within
    reach of the room's own wall — so a dark room stays dark and a
    light one light, whatever colour was asked for. */
export function tamePlaster(roomBase: string, wanted: string): string {
  const want = hexToHsl(wanted);
  const own = hexToHsl(roomBase);
  if (!want || !own) return roomBase;
  const [h, s, l] = want;
  const sat = Math.min(s, 0.22);
  const light = Math.max(own[2] - 0.16, Math.min(own[2] + 0.12, l));
  return hslToHex(h, sat, light);
}

/**
 * A room as the deck asked for it: the preset, with the knobs turned.
 * The result is a room like any other — everything that draws the
 * scene reads it the same way.
 */
export function resolveRoom(name?: RoomName, knobs: Knobs = {}): Room {
  const base = roomNamed(name);
  const room: Room = {
    ...base,
    plaster: { ...base.plaster },
    floor: { ...base.floor },
    light: { ...base.light },
    dust: { ...base.dust },
    paper: { ...base.paper },
    chrome: { ...base.chrome },
    knobs: { ...knobs },
  };
  if (knobs.wall) room.plaster.base = tamePlaster(base.plaster.base, knobs.wall);
  if (knobs.floor === "none") room.floor.kind = "none";
  else if (knobs.floor && knobs.floor !== base.floor.kind) {
    const f = FLOOR_OF[knobs.floor][base.chrome.scheme];
    room.floor = { kind: knobs.floor, base: f.base, tint: f.tint };
  }
  if (knobs.light) {
    const l = LIGHT_OF[knobs.light];
    room.light = { ...room.light, sky: l.sky, ground: l.ground, key: l.key, fill: l.fill };
    room.dust = { ...room.dust, color: l.dust };
  }
  return room;
}

/* The room the deck is being built in. Set once, before any card is
   filled in or any surface drawn, and read by whatever needs a colour
   the room decides. */
let current: Room = plaster;
export const currentRoom = () => current;
export function setRoom(room: Room) {
  current = room;
}

/** Colour the chrome around the wall — loader, hint, the text version —
    to match the room. The tokens live in base.css; this overrides them
    on the root so every stylesheet that reads them follows. */
export function applyChrome(room: Room) {
  const s = document.documentElement.style;
  const c = room.chrome;
  s.setProperty("--cream", c.cream);
  s.setProperty("--ink", c.ink);
  s.setProperty("--ink-soft", c.inkSoft);
  s.setProperty("--line", c.line);
  s.setProperty("--accent", c.accent);
  s.setProperty("--panel", c.panel);
  s.setProperty("--field", c.field);
  s.setProperty("--bad", c.bad);
  s.setProperty("color-scheme", c.scheme);
  document.documentElement.dataset.room = room.name;
}
