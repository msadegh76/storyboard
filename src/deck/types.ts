/* What a deck looks like when someone writes one.

   This is the public surface of the project: every field an author can
   set, and nothing else. The engine's own working shape lives in
   `Promise` at the bottom — an author never writes one of those.

   Everything here is optional except the words on the card. What the
   author leaves out, `schema.ts` decides. */

import type { PaperName } from "../textures/papers.js";
import type { RoomName, FloorKind, LightKind } from "../rooms.js";

/** How a card is held to the wall. */
export type Attach = "pin" | "clip" | "tape";

/** The hand a card is written in. */
export type Font = "hand" | "sans" | "serif";

/** A small drawing in the corner of a note. */
export type Doodle = "none" | "heart" | "star" | "sprig" | "arrow";

/** What a card is: paper, a picture, or writing on the plaster itself. */
export type CardType = "note" | "photo" | "mural";

/** A figure the eye reads by column. */
export interface Table {
  /** The header row, if it has one. */
  head?: string[];
  /** The body, one array per row. */
  rows: string[][];
}

/* ------------------------------------------------------------------
   The card
------------------------------------------------------------------ */

/** What every card can carry, whatever kind it is. */
interface CardBase {
  /** The heading. */
  title?: string;
  /** A line or a paragraph under it. */
  text?: string;
  /** A list. Giving one ranges the whole card left. */
  bullets?: string[];
  /** A faint line at the foot: a source, a caveat, an aside. */
  foot?: string;
  /** A figure, laid out by column. */
  table?: Table;
  /**
   * What you say while this card is up.
   *
   * It shows in the presenter window, beside the next card and the
   * clock. It is also **published**: a deck read rather than watched
   * has no speaker, so this is the narration that stands in for one,
   * and it goes into the text beside the wall. Write what an audience
   * would hear — not a private reminder to yourself.
   */
  say?: string;

  /* ---- the hand it is written in ---- */
  font?: Font;

  /* ---- placement, all of it optional ---- */
  /** Across the wall, in wall units. Setting it pins the card. */
  x?: number;
  /** Up the wall, in wall units. Setting it pins the card. */
  y?: number;
  /** How wide, in wall units. */
  w?: number;
  /** Height as a multiple of width. Measured from the content if unset. */
  ratio?: number;
  /** Tilt, in degrees. Drawn from the deck's seed if unset. */
  rot?: number;
  /** Which stop this card belongs to. Its own slide, if unset. */
  slide?: number;
}

/** A note: words on a sheet of paper, pinned up. */
export interface NoteCard extends CardBase {
  type?: "note";
  /** The stock it is printed on. */
  paper?: PaperName;
  /** How it is held up. */
  attach?: Attach;
  /** The head of the pin, as a hex number — `0x9a7b3f` by default. */
  pinColor?: number;
  /** A small drawing in the corner. */
  doodle?: Doodle;
}

/** A picture, matted on paper like a print. */
export interface PhotoCard extends CardBase {
  type?: "photo";
  /** Path to the picture, relative to `public/`. */
  image: string;
  /** A line written under the picture, on the mat. */
  caption?: string;
  paper?: PaperName;
  attach?: Attach;
  pinColor?: number;
}

/** Writing painted into the plaster. It never lifts, sways, or casts a
    shadow, and the layout pass moves paper around it rather than it. */
export interface MuralCard extends CardBase {
  type?: "mural";
  /* A mural is not paper and is not held up by anything, so it takes
     none of those fields. Spelling them out as never is what makes a
     misspelt `paper` an error: without it the checker simply reads the
     card as a mural — the one arm of the union with no `paper` to be
     wrong about — and says nothing. */
  paper?: never;
  attach?: never;
  pinColor?: never;
  doodle?: never;
  image?: never;
  /** The heading, painted. Shorthand: `mural: "Heading"`. */
  mural?: string | true;
  /** The smaller line under it. Shorthand for `text`. */
  sub?: string;
  /** The colour of the paint. */
  paint?: string;
  /** A rule under the heading. On by default. */
  rule?: boolean;
  /** Written with a marker rather than a brush. On by default. */
  ink?: boolean;
}

/** Any card an author can write. A bare string is a card of plain text. */
export type Card = NoteCard | PhotoCard | MuralCard | string;

/* ------------------------------------------------------------------
   The slide
------------------------------------------------------------------ */

/** Several cards held together in one stop. `cards` is an alias. */
export type MultiCardSlide = { notes: Card[] } | { cards: Card[] };

/** One stop on the walk: a single card written straight in, or several. */
export type Slide = Card | MultiCardSlide;

/* ------------------------------------------------------------------
   The deck
------------------------------------------------------------------ */

/** Where the walk opens onto the whole wall, and where it closes back. */
export type Overview = "both" | "start" | "end" | "none";

/** A deck, as authored. */
export interface Deck {
  /** The browser tab, and the mark on the loader. */
  title?: string;
  /** The line under it while the wall is being pinned up. */
  subtitle?: string;
  /**
   * Seeds the tilt of every card, so a deck lays out the same way on
   * every load. Anything may be used; the title is the default.
   */
  seed?: string | number;
  /** Wide shots at the ends of the walk. `"both"` by default. */
  overview?: Overview;
  /**
   * The room the deck hangs in: `"plaster"` (default), `"studio"` or
   * `"night"`. A room is the wall, the floor, the light, and what paper
   * and ink a card gets when you say nothing — chosen whole.
   */
  room?: RoomName;
  /** The wall's tint, `#rrggbb`. Kept within what still reads as plaster. */
  wall?: string;
  /** What is underfoot: `"oak"`, `"concrete"`, or `"none"` for a wall alone. */
  floor?: FloorKind;
  /** How warm the light is: `"warm"` or `"cool"`. */
  light?: LightKind;
  /** The stops, in the order they are walked. */
  slides: Slide[];
}

/**
 * Identity, but typed: wrapping a deck in this gives an editor
 * everything it needs to complete and check the object as it is
 * written, without the file having to be TypeScript.
 *
 * ```js
 * import { defineDeck } from "./src/deck/types.js";
 *
 * export default defineDeck({
 *   title: "My wall",
 *   slides: [{ title: "Hello", text: "…" }],
 * });
 * ```
 */
export function defineDeck(deck: Deck): Deck {
  return deck;
}

/* ------------------------------------------------------------------
   What the engine works with
------------------------------------------------------------------ */

/* A card once the schema has filled in everything the author left
   unsaid. Not part of the authoring surface — it is what the wall is
   built from. Every optional field here is one the engine may still
   derive later: a photo's width from its picture, a note's ratio from
   its own words. */
export interface Promise_ {
  id: string;
  slide: number;
  type: CardType;
  paper: PaperName;
  attach: Attach;
  pinColor: number;
  font: Font;
  doodle: Doodle;
  rot: number;
  w: number;
  /** Set once the deck is laid out. */
  x?: number;
  y?: number;
  ratio?: number;
  /* True while that value is still the engine's own guess rather than
     something the author pinned. What the engine derived it may derive
     again — and the dev-mode editor leaves it out of what it writes,
     so a deck never ends up spelling out a layout nobody chose. */
  autoWidth?: boolean;
  autoX?: boolean;
  autoY?: boolean;
  autoRot?: boolean;

  title?: string;
  text?: string;
  bullets?: string[];
  foot?: string;
  table?: Table;
  /** The narration. Published — see `say` on the authoring surface. */
  say?: string;
  image?: string;
  /** Written under the picture, on the mat. */
  caption?: string;
  /** The picture, once it has landed. */
  userImage?: HTMLImageElement;
  /* A photo card with no picture behind it still has to show something.
     Not part of the authoring surface — the engine's own fallback. */
  photo?: "beach" | "mountain";

  paint?: string;
  rule?: boolean;
  ink?: boolean;
}

/** One stop, resolved against the wall. */
export interface Beat {
  /** A wide shot of the whole wall. */
  overview?: boolean;
  /** The stop's number, matching every card carrying it. */
  slide?: number;
  /** The groups this stop frames. Filled by `resolveStory`. */
  _gs?: import("../scene/card.js").CardGroup[];
}
