/* A picture, on its way in.

   Every picture is decoded, turned upright, cut to what the wall can
   use, and written out again as WebP with nothing else in it — no
   metadata, no location, no original. The wall never draws a picture
   into a texture larger than this, and the memory a deck takes was
   measured to be the unresized uploads, so the door is where to fix
   it. The name is the content, so the same picture twice is one file
   and a link to it can be cached for a year.

   Anything sharp cannot decode is not a picture. That is the whole of
   the type check; a declared MIME type is not consulted. */

import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_EDGE = 2048;

/**
 * @param {Buffer} input
 * @param {{ maxEdge?: number, quality?: number }} [opts]
 * @returns {Promise<{ data: Buffer, width: number, height: number, bytes: number, mime: string, file: string }>}
 */
export async function sizePicture(input, opts = {}) {
  const maxEdge = opts.maxEdge ?? MAX_EDGE;
  let out;
  try {
    out = await sharp(input, { limitInputPixels: 80e6, animated: false, density: 144 })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: opts.quality ?? 84 })
      .toBuffer({ resolveWithObject: true });
  } catch (err) {
    throw new Error(
      `that is not a picture the wall can show — PNG, JPEG, GIF, WebP, AVIF or SVG (${err instanceof Error ? err.message : err})`,
    );
  }
  const file = `${createHash("sha256").update(out.data).digest("hex").slice(0, 20)}.webp`;
  return {
    data: out.data,
    width: out.info.width,
    height: out.info.height,
    bytes: out.data.length,
    mime: "image/webp",
    file,
  };
}
