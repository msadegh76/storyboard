/* A deck, checked before it is kept.

   The wall forgives: a misspelt paper falls back and is complained
   about, and the deck still presents. A server has to be stricter
   about shape — a slide that is not an object, a card with nothing to
   draw, a deck too big to be a deck — and just as forgiving about
   values, because the same author is on the other end. So: what the
   wall would refuse is refused here, with a message; what the wall
   would fall back from is dropped here, with a complaint, so the
   document that is kept is one the wall will draw without a word.

   Nothing is evaluated. The dev server's plugin runs the slide it is
   sent as code, which is right on localhost and wrong anywhere else.

   The lists come from the same leaves the wall reads, so this cannot
   drift from the schema: fields.ts, papers.ts, rooms.ts. */

import { ATTACHES, DOODLES, FONTS, OVERVIEWS, TYPES } from "../src/deck/fields.ts";
import { PAPERS } from "../src/textures/papers.ts";
import { FLOORS, LIGHTS, ROOMS } from "../src/rooms.ts";

/** @typedef {import("../src/deck/types.ts").Deck} Deck */
/** @typedef {import("../src/deck/types.ts").Slide} Slide */
/** @typedef {import("../src/deck/types.ts").Card} Card */

export class ValidationError extends Error {
  /** @override */
  name = "ValidationError";
}

export const LIMITS = {
  deckBytes: 256 * 1024,
  slides: 200,
  cardsPerSlide: 12,
  cards: 400,
};

/* ------------------------------------------------------------------
   One value
------------------------------------------------------------------ */

/* Each checker takes what was sent and returns what to keep, or
   undefined for "drop it and complain". Control characters go, bar
   the ones a paragraph needs. */
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
/** @typedef {(v: unknown) => unknown} Check */
/** @param {number} max @returns {Check} */
const str = (max) => (v) =>
  typeof v === "string" && v.length <= max ? v.replace(CONTROL, "") : undefined;
/** @param {readonly string[]} list @returns {Check} */
const oneOf = (list) => (v) => (typeof v === "string" && list.includes(v) ? v : undefined);
/** @param {number} lo @param {number} hi @returns {Check} */
const num = (lo, hi) => (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
/** @param {number} lo @param {number} hi @returns {Check} */
const int = (lo, hi) => (v) => (Number.isInteger(v) && /** @type {number} */ (v) >= lo && /** @type {number} */ (v) <= hi ? v : undefined);
/** @type {Check} */
const bool = (v) => (typeof v === "boolean" ? v : undefined);
/** @param {number} max @param {Check} each @returns {Check} */
const list = (max, each) => (v) => {
  if (!Array.isArray(v) || v.length > max) return undefined;
  const out = v.map(each);
  return out.every((x) => x !== undefined) ? out : undefined;
};
/** @type {Check} */
const colour = (v) =>
  typeof v === "string" && /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i.test(v) ? v : undefined;
/** @type {Check} */
const hex6 = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
/* A picture is a name under the deck's own pictures, or a path a
   pushed deck brought with it. Never absolute, never climbing out. */
/** @type {Check} */
const picture = (v) =>
  typeof v === "string" && v.length <= 300 && /^(?!\/)(?!.*\.\.)[A-Za-z0-9._~/-]+$/.test(v)
    ? v
    : undefined;
/** @type {Check} */
const table = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const cell = str(200);
  const row = list(12, cell);
  const rows = /** @type {string[][] | undefined} */ (list(40, row)(/** @type {{rows?: unknown}} */ (v).rows));
  if (!rows) return undefined;
  const head = /** @type {{head?: unknown}} */ (v).head;
  if (head == null) return { rows };
  const h = /** @type {string[] | undefined} */ (row(head));
  return h ? { head: h, rows } : undefined;
};
/** @type {Check} */
const mural = (v) => (v === true ? true : str(200)(v));
/** @type {Check} */
const seed = (v) => (typeof v === "number" && Number.isFinite(v) ? v : str(100)(v));

const CARD = {
  type: oneOf(TYPES),
  title: str(200),
  text: str(2000),
  bullets: list(24, str(300)),
  foot: str(300),
  table,
  say: str(4000),
  font: oneOf(FONTS),
  x: num(-200, 200),
  y: num(-200, 200),
  w: num(0.1, 60),
  ratio: num(0.05, 10),
  rot: num(-180, 180),
  slide: int(1, 1000),
  paper: oneOf(Object.keys(PAPERS)),
  attach: oneOf(ATTACHES),
  pinColor: int(0, 0xffffff),
  doodle: oneOf(DOODLES),
  image: picture,
  caption: str(300),
  mural,
  sub: str(300),
  paint: colour,
  rule: bool,
  ink: bool,
};

const DECK = {
  title: str(200),
  subtitle: str(300),
  seed,
  overview: oneOf(OVERVIEWS),
  room: oneOf(ROOMS),
  wall: hex6,
  floor: oneOf(FLOORS),
  light: oneOf(LIGHTS),
};

/* ------------------------------------------------------------------
   A card, a slide, a deck
------------------------------------------------------------------ */

/**
 * @param {unknown} raw
 * @param {string} where
 * @param {string[]} complaints
 * @returns {Card}
 */
function checkCard(raw, where, complaints) {
  if (typeof raw === "string") {
    const text = /** @type {string | undefined} */ (str(2000)(raw));
    if (text === undefined) throw new ValidationError(`${where}: that text is too long`);
    return text;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ValidationError(`${where}: a card has to be an object`);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    const check = CARD[/** @type {keyof typeof CARD} */ (key)];
    if (!check) {
      complaints.push(`${where}: no such field "${key}". Dropped.`);
      continue;
    }
    const kept = check(value);
    if (kept === undefined || kept === null) complaints.push(`${where}: bad value for ${key}. Dropped.`);
    else out[key] = kept;
  }
  // what the wall itself refuses: there has to be something to draw
  const words = out.title || out.text || out.mural || out.image || out.table;
  if (!words && !(Array.isArray(out.bullets) && out.bullets.length))
    throw new ValidationError(`${where}: a card needs a title, some text, or a picture`);
  return /** @type {Card} */ (/** @type {unknown} */ (out));
}

/**
 * @param {unknown} raw
 * @param {string} where
 * @param {string[]} complaints
 * @returns {Slide}
 */
export function checkSlide(raw, where, complaints) {
  if (typeof raw === "string") return checkCard(raw, where, complaints);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ValidationError(`${where}: a slide has to be an object`);
  const box = /** @type {{ notes?: unknown, cards?: unknown }} */ (raw);
  const held = Array.isArray(box.notes) ? box.notes : Array.isArray(box.cards) ? box.cards : null;
  if (!held) return checkCard(raw, where, complaints);
  if (!held.length) throw new ValidationError(`${where}: a slide needs at least one card`);
  if (held.length > LIMITS.cardsPerSlide)
    throw new ValidationError(`${where}: at most ${LIMITS.cardsPerSlide} cards on one slide`);
  for (const key of Object.keys(box))
    if (key !== "notes" && key !== "cards")
      complaints.push(`${where}: a slide holding several cards has no "${key}". Dropped.`);
  return {
    notes: held.map((c, i) => checkCard(c, `${where}, card ${i + 1}`, complaints)),
  };
}

/**
 * The whole deck. Throws a ValidationError for what cannot be kept;
 * returns what can, and what was dropped on the way.
 * @param {unknown} raw
 * @param {{ deckBytes?: number }} [limits]
 * @returns {{ deck: Deck, complaints: string[] }}
 */
export function checkDeck(raw, limits = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ValidationError("the deck has to be an object");
  const max = limits.deckBytes ?? LIMITS.deckBytes;
  if (JSON.stringify(raw).length > max)
    throw new ValidationError(`the deck is over ${Math.round(max / 1024)} KB`);
  /** @type {string[]} */
  const complaints = [];
  /** @type {Record<string, unknown>} */
  const out = {};
  const src = /** @type {Record<string, unknown>} */ (raw);
  for (const [key, value] of Object.entries(src)) {
    if (key === "slides" || value === undefined || value === null) continue;
    const check = DECK[/** @type {keyof typeof DECK} */ (key)];
    if (!check) {
      complaints.push(`deck: no such field "${key}". Dropped.`);
      continue;
    }
    const kept = check(value);
    if (kept === undefined || kept === null) complaints.push(`deck: bad value for ${key}. Dropped.`);
    else out[key] = kept;
  }
  if (!Array.isArray(src.slides)) throw new ValidationError("`slides` must be an array");
  if (src.slides.length > LIMITS.slides)
    throw new ValidationError(`at most ${LIMITS.slides} slides in a deck`);
  const slides = src.slides.map((s, i) => checkSlide(s, `slide ${i + 1}`, complaints));
  const cards = slides.reduce(
    (n, s) => n + (typeof s === "object" && "notes" in s ? s.notes.length : 1),
    0,
  );
  if (cards > LIMITS.cards) throw new ValidationError(`at most ${LIMITS.cards} cards in a deck`);
  out.slides = slides;
  return { deck: /** @type {Deck} */ (/** @type {unknown} */ (out)), complaints };
}
