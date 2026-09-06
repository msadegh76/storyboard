/* Turning what an author wrote into what the wall can build.

   A deck is a list of slides. A slide is one stop on the walk, and it
   holds one card or several — the camera pulls back far enough to hold
   whatever is there. Everything an author does not say is decided here:
   the slide number, where the card hangs, how wide it is, how far it is
   tilted, and what kind of card it is at all.

   Every derived field is still an override. Writing `x`, `w` or `rot`
   on a card pins that value and the engine leaves it alone, so a wall
   can be hand-composed one card at a time without leaving this format. */

import { makeRng, hashSeed, clamp } from "../util.js";
import { PAPERS } from "../textures/papers.js";
import { photoRatio } from "../textures/photo.js";
import { imageFor } from "./images.js";
import { complain } from "./complaints.js";
import { currentRoom, isRoomName, roomNamed, setRoom, ROOMS } from "../rooms.js";
import type { Beat, CardType, Deck, Promise_, Slide } from "./types.js";

/* A card mid-read: the author's object with the shorthands resolved,
   but nothing filled in and nothing yet trusted. `fill` is what turns
   one of these into a Promise_. */
type Draft = Partial<Promise_> & {
  mural?: string | true;
  sub?: string;
};

/* The values each field will take. Exported so the dev-mode editor
   offers exactly what the checker accepts, rather than a second list
   that quietly drifts from this one. */
export const ATTACHES: readonly string[] = ["pin", "clip", "tape"];
export const FONTS: readonly string[] = ["hand", "sans", "serif"];
export const TYPES: readonly string[] = ["note", "photo", "mural"];
export const DOODLES: readonly string[] = [
  "none",
  "heart",
  "star",
  "sprig",
  "arrow",
];

/* Default width in wall units, by kind. A mural is writing across the
   plaster and wants room; a note is an index card. A photo is given a
   width later, from the shape of its own picture — see `sizeCards`. */
const WIDTH: Record<CardType, number> = { note: 5.0, photo: 5.6, mural: 15 };

/* The height a picture is cut to when the author does not say. Every
   capture ends up about this tall, whatever its shape, so a row of
   them reads as a row rather than as a skyline. */
const PHOTO_H = 5.4;

/* A bad value falls back and is complained about; see complaints.ts.
   What cannot be recovered from — a slide with no cards — still stops
   everything, because there is nothing to draw. */
export { deckComplaints } from "./complaints.js";

class DeckError extends Error {
  constructor(where: string, msg: string) {
    super(`storyboard: ${where} — ${msg}`);
    this.name = "DeckError";
  }
}

/* ------------------------------------------------------------------
   One card
------------------------------------------------------------------ */

/* An author writes the shorthand that fits what they mean; each of
   these is a card. `mural:` and `image:` say what kind it is, so the
   kind almost never has to be written down. */
function readCard(raw: unknown, where: string): Draft {
  if (typeof raw === "string") raw = { text: raw };
  if (!raw || typeof raw !== "object")
    throw new DeckError(where, `expected a card object, got ${typeof raw}`);

  // the one cast in the file: what the author wrote is checked below,
  // not trusted here
  const c: Draft = { ...(raw as Draft) };

  // `mural: "Heading"` is shorthand for a painted heading of that name
  if (typeof c.mural === "string") {
    c.title = c.title ?? c.mural;
    c.type = "mural";
  } else if (c.mural === true) c.type = "mural";
  delete c.mural;

  // `sub:` is the smaller line under either kind of heading
  if (c.sub != null) {
    c.text = c.text ?? c.sub;
    delete c.sub;
  }

  if (!c.type) c.type = c.image ? "photo" : "note";

  /* Each of these falls back rather than refusing: the card still
     presents, wearing the default, and the console says what was
     wrong. `undefined` lets `fill` supply the default. */
  const pick = <T,>(
    value: T | undefined,
    ok: (v: T) => boolean,
    field: string,
    valid: readonly string[],
  ): T | undefined => {
    if (value == null || ok(value)) return value;
    complain(
      where,
      `unknown ${field} ${JSON.stringify(value)}. Using the default. Valid: ${valid.join(", ")}`,
    );
    return undefined;
  };

  if (!TYPES.includes(String(c.type))) {
    complain(
      where,
      `unknown type ${JSON.stringify(c.type)}. Treating it as a note. Valid: ${TYPES.join(", ")}`,
    );
    c.type = "note";
  }
  /* Absent, not present-and-undefined.

     `fill` lays the author's card over the defaults with Object.assign,
     and an own property holding `undefined` overwrites a default just
     as surely as a real value would. Assigning the result of `pick`
     straight back is what quietly left thirty-four of thirty-seven
     cards carrying `attach: undefined` rather than "pin" — harmless
     only because every drawing routine happened to have a fallback of
     its own for it. */
  const keep = (
    field: "paper" | "attach" | "font" | "doodle",
    value: unknown,
  ) => {
    if (value === undefined) delete c[field];
    else (c as Record<string, unknown>)[field] = value;
  };

  keep("paper", pick(c.paper, (v) => v in PAPERS, "paper", Object.keys(PAPERS)));
  keep("attach", pick(c.attach, (v) => ATTACHES.includes(v), "attach", ATTACHES));
  keep("font", pick(c.font, (v) => FONTS.includes(v), "font", FONTS));
  keep("doodle", pick(c.doodle, (v) => DOODLES.includes(v), "doodle", DOODLES));

  if (c.bullets != null && !Array.isArray(c.bullets)) {
    complain(where, "`bullets` must be an array of strings. Dropping it.");
    delete c.bullets;
  }

  /* This one is not recoverable: there is nothing to draw. It is a
     slide the author meant to write and did not, so it is worth
     stopping for. */
  if (!c.title && !c.text && !c.bullets?.length && !c.image && !c.table)
    throw new DeckError(where, "a card needs a title, some text, or an image");

  return c;
}

/* ------------------------------------------------------------------
   One slide, which is one stop on the walk
------------------------------------------------------------------ */
function readSlide(raw: Slide, index: number): Draft[] {
  const where = `slide ${index + 1}`;
  if (!raw || typeof raw !== "object")
    throw new DeckError(where, `expected a slide object, got ${typeof raw}`);

  // `{ notes: [...] }` is several cards held in one stop; anything else
  // is a single card written straight into the slide
  const box = raw as { notes?: unknown; cards?: unknown };
  const list = Array.isArray(box.notes)
    ? box.notes
    : Array.isArray(box.cards)
      ? box.cards
      : [raw];
  if (!list.length) throw new DeckError(where, "a slide needs at least one card");

  return list.map((c: unknown, i: number) =>
    readCard(c, list.length > 1 ? `${where}, card ${i + 1}` : where),
  );
}

/* ------------------------------------------------------------------
   The deck
------------------------------------------------------------------ */

/**
 * @param {object} config the deck as authored
 * @returns {{promises: object[], story: object[], images: string[], title: string}}
 */
export function normalizeDeck(config: Deck) {
  if (!config || typeof config !== "object")
    throw new DeckError("deck", "the config must be an object");
  /* Empty is allowed: a deck with no slides is a bare wall, which is
     where a new one starts — the dev-mode editor adds the first stop
     from there. Anything that is not an array is a mistake. */
  if (!Array.isArray(config.slides))
    throw new DeckError("deck", "`slides` must be an array");

  /* The room first: every card filled in below takes its paper, its
     pin and its ink from it. An unknown room is a complaint, not a
     refusal — the deck hangs in plaster and says so. */
  if (config.room != null && !isRoomName(config.room))
    complain(
      "deck",
      `unknown room ${JSON.stringify(config.room)}. Hanging it in plaster. Valid: ${ROOMS.join(", ")}`,
    );
  const room = roomNamed(isRoomName(config.room) ? config.room : undefined);
  setRoom(room);

  const rng = makeRng(
    config.seed != null ? hashSeed(String(config.seed)) : hashSeed(config.title || "storyboard"),
  );

  const promises: Promise_[] = [];
  const story: Beat[] = [];
  const images = new Set<string>();

  // an overview at each end unless the deck says otherwise: the walk
  // opens on the whole wall and closes back out to it
  const ends = config.overview ?? "both";
  if (ends === "both" || ends === "start") story.push({ overview: true });

  config.slides.forEach((raw: Slide, i: number) => {
    const slide = i + 1;
    readSlide(raw, i).forEach((c: Draft) => {
      if (c.image) images.add(c.image);
      promises.push(fill(c, slide, rng));
    });
    story.push({ slide });
  });

  if (ends === "both" || ends === "end") story.push({ overview: true });

  return {
    title: config.title || "Storyboard",
    subtitle: config.subtitle || "",
    room,
    promises,
    story,
    images: [...images],
  };
}

/**
 * Give every picture the width that makes it the right size on the
 * wall. Called once the images have landed and before anything is
 * placed — a card sized by its picture rather than by a guess is what
 * keeps a wide dashboard wide and a phone capture narrow, instead of
 * making one of them tower over the wall.
 *
 * A card whose width the author pinned is left alone.
 *
 * @param {object[]} promises the normalized deck
 */
export function sizeCards(promises: Promise_[]) {
  for (const p of promises) {
    if (p.type !== "photo" || !p.autoWidth) continue;
    const img = imageFor(p.image);
    if (!img) continue;
    p.w = clamp(PHOTO_H / photoRatio(img), 2.4, 9);
  }
}

let uid = 0;
const lerp = (t: number, a: number, b: number) => a + t * (b - a);

/* Everything the author left unsaid.

   The generator is read for every card whether or not its tilt was
   pinned, so hand-placing one card cannot shift the tilt of the ones
   after it. A note's height is measured from its own words (paper.js)
   and a photo's from its picture (photo.js), so `ratio` never appears
   here except for a mural, which is a band of writing at a fixed
   proportion rather than a sheet of paper. */
/**
 * Everything a card of this kind gets when the author says nothing.
 *
 * Exported because two places need to agree on it: this file, which
 * fills a card in, and the dev-mode editor, which has to know what a
 * default *is* so it can leave one out of what it writes. A deck that
 * spells out every value it never chose is a deck nobody can read.
 *
 * @param type the kind of card
 */
export function cardDefaults(type: CardType) {
  const mural = type === "mural";
  const room = currentRoom();
  return {
    paper: room.paper.stock as Promise_["paper"],
    attach: (type === "photo" ? "tape" : "pin") as Promise_["attach"],
    pinColor: room.paper.pin,
    font: (mural ? "serif" : "hand") as Promise_["font"],
    doodle: "none" as Promise_["doodle"],
    w: WIDTH[type],
    ...(mural ? { ratio: 0.26, rule: true, ink: true } : {}),
  };
}

function fill(c: Draft, slide: number, rng: () => number): Promise_ {
  const mural = c.type === "mural";
  const tilt = mural
    ? // a painted line that leans reads as a mistake rather than a hand
      lerp(rng(), -0.6, 0.6)
    : lerp(rng(), -2.4, 2.4);

  const out = {
    id: "c" + ++uid,
    slide,
    ...cardDefaults(c.type ?? "note"),
    rot: tilt,
    // remember which of these were ours, so `sizeCards` may revise the
    // width and the editor knows what it is allowed to leave unwritten
    autoWidth: c.w == null,
    autoX: c.x == null,
    autoY: c.y == null,
    autoRot: c.rot == null,
  };
  return Object.assign(out, c) as Promise_;
}
