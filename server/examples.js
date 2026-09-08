/* The example decks, as templates.

   A new deck on a host can start as one of the decks under examples/,
   the way a checkout does. The deck file is read as data (no code is
   run — see tools/deck-json.mjs) and its pictures are brought in
   through the same door an upload goes through, so the new deck owns
   its own copies and nothing points back at public/. */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { readDeckModule } from "../tools/deck-json.mjs";

/** @typedef {import("../src/deck/types.ts").Deck} Deck */
/** @typedef {import("../src/deck/types.ts").Card} Card */

export const EXAMPLES = [
  { name: "hello-wall", title: "Hello, wall" },
  { name: "lighthouse-bakery", title: "Lighthouse Bakery" },
  { name: "onboarding", title: "Getting started" },
];

export const isExample = (/** @type {string} */ name) => EXAMPLES.some((e) => e.name === name);

/** @param {string} root @param {string} name */
export async function readExample(root, name) {
  if (!isExample(name)) throw new Error(`no example called ${name}`);
  return readDeckModule(path.join(root, "examples", name, "deck.config.js"));
}

/**
 * Every card in a deck, with the slide it is on, so a walk over the
 * pictures can rewrite them in place.
 * @param {Deck} deck
 * @returns {Card[]}
 */
export function cardsOf(deck) {
  const out = [];
  for (const slide of deck.slides) {
    const box = /** @type {{ notes?: Card[], cards?: Card[] }} */ (slide);
    const held = Array.isArray(box.notes) ? box.notes : Array.isArray(box.cards) ? box.cards : [slide];
    for (const c of held) out.push(/** @type {Card} */ (c));
  }
  return out;
}

/**
 * Bring a deck's pictures in through `keep`, rewriting each `image:`
 * to what it says. A picture that cannot be read is left as it was,
 * and the wall shows the card's words instead — the same fallback a
 * checkout has.
 * @param {Deck} deck
 * @param {(imagePath: string) => Promise<Buffer | null>} read
 * @param {(data: Buffer) => Promise<{ path: string }>} keep
 */
export async function importPictures(deck, read, keep) {
  /** @type {Map<string, string>} */
  const done = new Map();
  const out = structuredClone(deck);
  for (const card of cardsOf(out)) {
    if (typeof card === "string" || !("image" in card) || !card.image) continue;
    const src = card.image;
    if (!done.has(src)) {
      const data = await read(src);
      if (!data) continue;
      done.set(src, (await keep(data)).path);
    }
    card.image = /** @type {string} */ (done.get(src));
  }
  return out;
}

/** A reader over public/ — where a checkout's pictures are. */
export const publicReader = (/** @type {string} */ root) => async (/** @type {string} */ p) => {
  const file = path.resolve(root, "public", p);
  if (!file.startsWith(path.resolve(root, "public") + path.sep)) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
};
