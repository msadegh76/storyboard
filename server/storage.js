/* Where the pictures are kept.

   Behind one small interface — put, get, delete, and everything under
   a prefix gone — so the disk beside the database is the first place
   and a bucket can be the second without the rest of the server
   noticing. A key is `<deck id>/<file>`, and both halves are checked
   before they are allowed near a path. */

import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const SAFE = /^[A-Za-z0-9._-]{1,120}$/;

/** @param {string} key */
export function checkKey(key) {
  const parts = key.split("/");
  if (parts.length !== 2 || !parts.every((p) => SAFE.test(p) && !p.startsWith(".")))
    throw new Error(`not a picture key: ${key}`);
  return /** @type {[string, string]} */ (parts);
}

/**
 * @typedef {object} Storage
 * @property {(key: string, data: Buffer) => Promise<void>} put
 * @property {(key: string) => Promise<{ stream: ReadableStream, size: number } | null>} get
 * @property {(key: string) => Promise<void>} delete
 * @property {(prefix: string) => Promise<void>} deleteAll everything under `<deck id>/`
 */

/**
 * Pictures on the disk beside the database.
 * @param {string} dir
 * @returns {Storage}
 */
export function diskStorage(dir) {
  const fileOf = (/** @type {string} */ key) => {
    const [deck, file] = checkKey(key);
    return path.join(dir, deck, file);
  };
  return {
    async put(key, data) {
      const file = fileOf(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async get(key) {
      const file = fileOf(key);
      try {
        const s = await stat(file);
        if (!s.isFile()) return null;
        return {
          stream: /** @type {ReadableStream} */ (Readable.toWeb(createReadStream(file))),
          size: s.size,
        };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(fileOf(key), { force: true });
    },
    async deleteAll(prefix) {
      if (!SAFE.test(prefix)) throw new Error(`not a deck: ${prefix}`);
      await rm(path.join(dir, prefix), { recursive: true, force: true });
    },
  };
}
