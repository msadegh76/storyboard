#!/usr/bin/env node
/* A deck module, read as data.

   A deck file is JavaScript, and the only import a deck makes is
   `defineDeck`, which is identity. Node will not resolve that import —
   it points at a TypeScript file by a `.js` name — so the line is
   swapped for the identity it stands for and the rest is evaluated as
   the module it is. A file that imports anything else is refused: a
   deck read as data must not run code.

   Used by the tests, by `pnpm push`, and by the server when it seeds a
   deck from one of the examples.

     node tools/deck-json.mjs                       # the deck deck.config.js points at
     node tools/deck-json.mjs examples/hello-wall/deck.config.js
*/

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFINE = /^[ \t]*import\s*\{[^}]*\bdefineDeck\b[^}]*\}\s*from\s*["'][^"']+["'];?[ \t]*$/m;

/**
 * Follow `export { default } from "..."` until a file that is a deck.
 * @param {string} file
 * @returns {Promise<string>} the file that actually holds the slides
 */
export async function resolveDeckFile(file) {
  for (let hop = 0; hop < 5; hop++) {
    const found = [file, file.replace(/\.js$/, ".ts")].find(existsSync);
    if (!found) throw new Error(`no deck at ${file}`);
    file = found;
    const src = await readFile(file, "utf8");
    const via = /export\s*\{\s*default\s*\}\s*from\s*["']([^"']+)["']/.exec(src);
    if (!via?.[1]) return file;
    file = path.resolve(path.dirname(file), via[1]);
  }
  throw new Error(`too many re-exports starting from ${file}`);
}

/**
 * @param {string} file a deck file, or a pointer to one
 * @returns {Promise<import("../src/deck/types.ts").Deck>}
 */
export async function readDeckModule(file) {
  const real = await resolveDeckFile(path.resolve(file));
  const src = await readFile(real, "utf8");
  const stubbed = src.replace(DEFINE, "const defineDeck = (d) => d;");
  if (/^[ \t]*import\s/m.test(stubbed))
    throw new Error(`${real} imports something other than defineDeck; a deck read as data may not`);
  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(stubbed).toString("base64")
  );
  const deck = mod.default;
  if (!deck || typeof deck !== "object" || !Array.isArray(deck.slides))
    throw new Error(`${real} does not export a deck`);
  return deck;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? "deck.config.js";
  readDeckModule(file).then(
    (deck) => process.stdout.write(JSON.stringify(deck, null, 2) + "\n"),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
