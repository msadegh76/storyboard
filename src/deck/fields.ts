/* The values a card's fields may take.

   A leaf: it imports nothing, so it can be read from anywhere — the
   schema that fills a card in, the panel that offers exactly these
   values, and the server that checks a hosted deck before keeping it.
   Three readers, one list, so none of them quietly drifts. The paper
   stocks live with the papers themselves (textures/papers.ts) and the
   rooms with the rooms (rooms.ts); both are leaves too. */

export const ATTACHES: readonly string[] = ["pin", "clip", "tape"];
export const FONTS: readonly string[] = ["hand", "sans", "serif"];
export const TYPES: readonly string[] = ["note", "photo", "mural"];
export const DOODLES: readonly string[] = ["none", "heart", "star", "sprig", "arrow"];
export const OVERVIEWS: readonly string[] = ["both", "start", "end", "none"];
