/* The deck, once it has been read.

   Both arrays keep their identity for the life of the page — they are
   filled at boot and never replaced — so every module can hold a plain
   reference to them rather than reaching back through a getter. */

import type { Beat, Promise_ } from "./types.js";

/** The stops, in the order they are walked. */
export const STORY: Beat[] = [];

/** Every card on the wall, before it is built. */
export const promises: Promise_[] = [];

export function setDeck(deck: { story: Beat[]; promises: Promise_[] }) {
  STORY.length = 0;
  STORY.push(...deck.story);
  promises.length = 0;
  promises.push(...deck.promises);
}
