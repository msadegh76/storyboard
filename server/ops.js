/* The slide operations, on a deck held as data.

   tools/deck-source.js does these on a file, one span of text at a
   time, so the author's comments survive. A hosted deck has no
   comments to keep: it is a JSON document, and each of these takes one
   and returns the next. Slide numbers are one-based, as they are on
   the wall and on the wire. Nothing here touches a database.

   Every function returns a new deck and leaves the one it was given
   alone. */

/** @typedef {import("../src/deck/types.ts").Deck} Deck */
/** @typedef {import("../src/deck/types.ts").Slide} Slide */

/** The one serialization everything compares by. */
export const canonical = (/** @type {Deck} */ deck) => JSON.stringify(deck);

/** @param {Deck} deck @returns {Deck} */
const copy = (deck) => structuredClone(deck);

/** @param {Deck} deck @param {number} n */
function index(deck, n) {
  if (!Number.isInteger(n) || n < 1 || n > deck.slides.length)
    throw new RangeError(`there is no slide ${n}; the deck has ${deck.slides.length}`);
  return n - 1;
}

/** Replace slide `n`. @param {Deck} deck @param {number} n @param {Slide} slide */
export function replaceSlide(deck, n, slide) {
  const out = copy(deck);
  out.slides[index(deck, n)] = slide;
  return out;
}

/**
 * Insert a slide after slide `after`; 0 puts it at the front.
 * @param {Deck} deck @param {number} after @param {Slide} slide
 */
export function insertSlide(deck, after, slide) {
  if (!Number.isInteger(after) || after < 0 || after > deck.slides.length)
    throw new RangeError(`cannot add after slide ${after}; the deck has ${deck.slides.length}`);
  const out = copy(deck);
  out.slides.splice(after, 0, slide);
  return out;
}

/** Take slide `n` out. @param {Deck} deck @param {number} n @returns {{ deck: Deck, removed: Slide }} */
export function removeSlide(deck, n) {
  const out = copy(deck);
  const [removed] = out.slides.splice(index(deck, n), 1);
  return { deck: out, removed: /** @type {Slide} */ (removed) };
}

/** Move slide `from` so that it becomes slide `to`. @param {Deck} deck @param {number} from @param {number} to */
export function moveSlide(deck, from, to) {
  const i = index(deck, from);
  const j = index(deck, to);
  const out = copy(deck);
  const [slide] = out.slides.splice(i, 1);
  out.slides.splice(j, 0, /** @type {Slide} */ (slide));
  return out;
}

/** The deck's own fields a panel may set. */
export const DECK_FIELDS = ["title", "subtitle", "seed", "overview", "room", "wall", "floor", "light"];

/**
 * Set the deck's own fields. A null takes one out.
 * @param {Deck} deck @param {Record<string, string | null>} set
 */
export function setFields(deck, set) {
  const out = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (copy(deck)));
  for (const [key, value] of Object.entries(set)) {
    if (!DECK_FIELDS.includes(key)) throw new RangeError(`the panel may not set ${key}`);
    if (value != null && typeof value !== "string")
      throw new RangeError(`${key} must be a string, or null to take it out`);
    if (value == null) delete out[key];
    else out[key] = value;
  }
  return /** @type {Deck} */ (/** @type {unknown} */ (out));
}

/**
 * What differs between two decks, in the words a publish sheet needs.
 *
 * Slides are matched by content, not position, so an insert at the
 * front is one slide added rather than every slide changed. What is
 * left unmatched on both sides is paired up as "changed"; the rest are
 * added or removed.
 *
 * @param {Deck | null} before the published copy, or null if none
 * @param {Deck} after the draft
 * @returns {{ added: number, removed: number, changed: number, fields: string[] }}
 */
export function describeChanges(before, after) {
  const a = (before?.slides ?? []).map((s) => JSON.stringify(s));
  const b = after.slides.map((s) => JSON.stringify(s));
  const left = new Map();
  for (const s of a) left.set(s, (left.get(s) ?? 0) + 1);
  let unmatchedB = 0;
  for (const s of b) {
    const n = left.get(s) ?? 0;
    if (n > 0) left.set(s, n - 1);
    else unmatchedB++;
  }
  let unmatchedA = 0;
  for (const n of left.values()) unmatchedA += n;
  const changed = Math.min(unmatchedA, unmatchedB);

  const fields = [];
  for (const key of DECK_FIELDS) {
    const x = before ? /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (before))[key] : undefined;
    const y = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (after))[key];
    if (before && JSON.stringify(x ?? null) !== JSON.stringify(y ?? null)) fields.push(key);
  }
  return { added: unmatchedB - changed, removed: unmatchedA - changed, changed, fields };
}
