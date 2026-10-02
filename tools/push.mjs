#!/usr/bin/env node
/* A deck written in a file, put on a host.

     STORYBOARD_TOKEN=… pnpm push --to https://wall.example
     pnpm push --to https://wall.example --deck examples/lighthouse-bakery/deck.config.js --publish

   The deck file is read as data (no code runs — see deck-json.mjs),
   each picture it names under public/ is uploaded and the card
   repointed at what the host calls it, and the whole draft is put on
   the deck whose address matches — made first if there is none. With
   --publish it goes to the link as well. The token comes from the
   home page of the host: "Make a token". */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { readDeckModule } from "./deck-json.mjs";
import { ROOT } from "../server/config.js";
import { cardsOf } from "../server/examples.js";
import { slugify } from "../server/decks.js";

const { values: args } = parseArgs({
  options: {
    to: { type: "string" },
    deck: { type: "string", default: "deck.config.js" },
    slug: { type: "string" },
    title: { type: "string" },
    publish: { type: "boolean", default: false },
    token: { type: "string" },
  },
});

const token = args.token || process.env.STORYBOARD_TOKEN;
if (!args.to || !token) {
  console.error("usage: STORYBOARD_TOKEN=… pnpm push --to https://wall.example [--deck file] [--slug name] [--publish]");
  process.exit(2);
}
const host = args.to.replace(/\/+$/, "");

/** @param {string} route @param {RequestInit & { json?: unknown }} [init] */
async function api(route, init = {}) {
  const headers = /** @type {Record<string, string>} */ ({ authorization: `Bearer ${token}`, ...(init.headers ?? {}) });
  let body = init.body;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${host}${route}`, { ...init, headers, body });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${route}: ${out.error || res.status}`);
  return out;
}

const deck = await readDeckModule(args.deck);
const title = args.title || deck.title || path.basename(path.dirname(path.resolve(args.deck)));
const slug = args.slug || slugify(title);

// the deck on the host with this address, or a new one
/** @typedef {{ id: string, slug: string, url: string, editUrl: string }} Mine */
/** @type {{ decks: Mine[] }} */
const { decks } = await api("/api/decks");
/** @type {Mine} */
const mine =
  decks.find((d) => d.slug === slug) ??
  (await api("/api/decks", { method: "POST", json: { title } }).then((/** @type {Mine} */ made) => {
    console.log(`made ${made.url}`);
    return made;
  }));

// its pictures, through the same door as a drop on the wall
const done = new Map();
for (const card of cardsOf(deck)) {
  if (typeof card === "string" || !("image" in card) || !card.image) continue;
  const src = card.image;
  if (!done.has(src)) {
    let data;
    try {
      data = await readFile(path.join(ROOT, "public", src));
    } catch {
      console.warn(`  ${src}: not under public/, left as it is`);
      done.set(src, src);
      continue;
    }
    const form = new FormData();
    form.append("file", new Blob([data]), path.basename(src));
    const up = await api(`/api/decks/${mine.id}/assets`, { method: "POST", body: form });
    done.set(src, up.path);
    console.log(`  ${src} → ${up.path} (${up.width}×${up.height})`);
  }
  card.image = done.get(src);
}

const put = await api(`/api/decks/${mine.id}/draft`, { method: "PUT", json: { deck: { ...deck, title } } });
console.log(`draft written: ${put.slides} slides, revision ${put.rev}`);
for (const c of put.complaints ?? []) console.warn(`  ${c}`);

if (args.publish) {
  const out = await api(`/api/decks/${mine.id}/publish`, { method: "POST", json: { rev: put.rev } });
  console.log(`published: ${out.url}`);
} else {
  console.log(`edit it at ${host}${mine.editUrl ?? `/edit/${mine.slug}`}, or pass --publish`);
}
