/* Where the deck comes from.

   Two places. Locally it is a module — `deck.config.js`, bundled, the
   file an author opens in their own editor. On a host it is written
   into the page by the server, as JSON in a script tag, along with
   what the page needs to know about it: whether it may be edited,
   where its pictures are, which revision it is.

   The wall does not care which. Both hand `normalizeDeck` the same
   object. Everything else that differs between the two — the editor's
   store, the presenter's address, the base a picture is fetched from —
   reads it from here rather than guessing from the URL. */

import type { Deck } from "./types.js";
import { setAssetBase } from "./images.js";

export type Visibility = "public" | "unlisted" | "private";

/** What the server says about a hosted deck. See server/shell.js. */
export interface Hosted {
  id: string;
  slug: string;
  title: string;
  /** The revision of the copy on this page: the draft's on /edit, the published one's on /d. */
  rev: number;
  /** This page is the draft, and the viewer owns it. */
  editable: boolean;
  /** Where `image:` paths resolve — `/a/<id>/`. */
  assetBase: string;
  /** The public address of the published deck. */
  url: string;
  /** Present on a published page when the viewer owns the deck. */
  editUrl?: string;
  visibility: Visibility;
  published: { rev: number; at: string } | null;
  /** The draft differs from what is published. */
  dirty: boolean;
  /** The front door: a template walked live, with the product's words over it. */
  landing?: boolean;
  /** The viewer is a guest: a wall to write on, no address yet. Publishing asks for one. */
  guest?: boolean;
}

export interface DeckSource {
  deck: Deck;
  mode: "file" | "hosted";
  hosted?: Hosted;
  /** Whether the editor may open on this page. */
  editable: boolean;
}

let current: DeckSource | null = null;

/** The source the page booted from. Only meaningful after `loadSource`. */
export function currentSource(): DeckSource {
  if (!current) throw new Error("storyboard: the deck has not been read yet");
  return current;
}

/** The presenter window's address: beside a built deck, or at the root of a host. */
export const presenterUrl = () =>
  current?.mode === "hosted" ? "/present.html" : "present.html";

/**
 * Read the deck. A page carrying a `#deck` script is a hosted one;
 * anything else is the module. The module is imported dynamically so a
 * hosted build never carries the example deck around with it.
 */
export async function loadSource(): Promise<DeckSource> {
  const tag = document.getElementById("deck");
  if (tag?.textContent?.trim()) {
    const hosted = JSON.parse(tag.textContent) as Hosted & { deck: Deck };
    const { deck, ...rest } = hosted;
    setAssetBase(rest.assetBase || "");
    current = { deck, mode: "hosted", hosted: rest, editable: !!rest.editable };
    return current;
  }
  const mod = await import("../../deck.config.js");
  current = { deck: mod.default, mode: "file", editable: import.meta.env.DEV };
  return current;
}
