/* What the two windows say to each other.

   A leaf: it imports nothing, and that is the whole point of it living
   in its own file. The presenter page needs the channel's name and the
   shape of a message, and if it reached into the module that also
   drives the wall to get them, the bundler would hand it three.js —
   half a megabyte of scene, on a page that draws no scene at all.
   Which is exactly what happened before this file existed. */

/** Same origin, one name; no server is involved in any of it. */
export const CHANNEL = "promise-wall";

/** One stop, as the presenter window is told about it. */
export interface PresentStop {
  slide: number;
  cards: {
    type: string;
    title?: string;
    text?: string;
    bullets?: string[];
    foot?: string;
    image?: string;
    say?: string;
  }[];
}

/** The whole deck, sent once when a presenter window says hello. */
export interface PresentDeck {
  title: string;
  stops: PresentStop[];
}

export type ToPresenter =
  | { t: "deck"; deck: PresentDeck }
  | { t: "at"; slide: number | null; at: number; total: number };

export type FromPresenter =
  | { t: "hello" }
  | { t: "go"; d: 1 | -1 }
  | { t: "goto"; slide: number }
  | { t: "home" };
