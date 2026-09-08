/* Loading the pictures a deck asks for.

   A capture that never arrives is not an error: the card falls back to
   a plain note, so a deck presents even before its screenshots have
   landed. The failure is reported once — to the console, and on a dev
   server on the page, beside the deck's other complaints — and the
   walk carries on. */

import { complain } from "./complaints.js";

const cache = new Map<string, HTMLImageElement>();

/* Where a relative `image:` is fetched from.

   Locally a path is relative to public/, and the page is served from
   the same place, so nothing needs adding. On a host a deck's pictures
   live under /a/<deck id>/, and the server says so when it hands the
   page the deck. A path that is already absolute is left alone. */
let assetBase = "";
export const setAssetBase = (base: string) => {
  assetBase = base;
};

/** The address a card's `image:` is actually fetched from. */
export const resolveImage = (src: string) =>
  /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src) ? src : assetBase + src;

/** The loaded <img> for a path, or undefined if it never arrived. */
export const imageFor = (src?: string) =>
  src == null ? undefined : cache.get(src);

/**
 * @param sources paths, relative to the public root
 * @returns resolves once every one has landed or failed
 */
export function loadImages(sources: string[]): Promise<void> {
  return Promise.all(
    sources.map(
      (src) =>
        new Promise<void>((done) => {
          const img = new Image();
          img.onload = () => {
            cache.set(src, img);
            done();
          };
          img.onerror = () => {
            complain(
              `image "${src}"`,
              "could not be loaded. That card will show its words instead — is the file under public/?",
            );
            done();
          };
          img.src = resolveImage(src);
        }),
    ),
  ).then(() => undefined);
}

/** Let the pictures go.

    A source image is needed twice: once to work out how wide its card
    should be, and once to draw it into that card's texture. After the
    wall is built it is finished with — but a decoded bitmap is held for
    as long as anything references it, and eighteen captures at their
    native size is a couple of hundred megabytes sitting behind a wall
    that has already stopped looking at them. */
export function releaseImages() {
  cache.clear();
}
