/* The dev server's half of the editor.
 *
 * A page cannot write a file; the server it was served from can. So the
 * panel beside the wall sends one slide here and this puts it into the
 * deck — the real file, the one the author opens in their own editor,
 * not a copy and not a different format. Pictures the author drops on
 * the wall come here too, and go under public/slides/.
 *
 * It exists only while `vite` is running. `apply: "serve"` keeps it out
 * of a build, where there is no server to write anything anyway.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  hasSlides,
  slideSpans,
  replaceSlide,
  insertSlide,
  removeSlide,
  moveSlide,
  slideText,
  setDeckField,
} from "./deck-source.js";

/* Which file actually holds the slides.
 *
 * `deck.config.js` at the root is usually a pointer — one line saying
 * which deck under `examples/` to present. Writing the edit there would
 * overwrite the pointer with a deck. So: follow the re-export until a
 * file turns up that has a `slides:` array of its own.
 *
 * A deck may be written as `deck.config.ts` instead — the wall imports
 * it as `.js` and Vite resolves that to the TypeScript file, so this
 * has to do the same. */
const asWritten = (file) =>
  [file, file.replace(/\.js$/, ".ts")].find(existsSync);

async function findDeck(root) {
  let file = path.join(root, "deck.config.js");
  for (let hop = 0; hop < 5; hop++) {
    const found = asWritten(file);
    if (!found) throw new Error(`no deck at ${file} (or .ts)`);
    file = found;
    const src = await readFile(file, "utf8");
    if (hasSlides(src)) return { file, src };
    const via = /export\s*\{\s*default\s*\}\s*from\s*["']([^"']+)["']/.exec(src);
    if (!via || !via[1]) break;
    file = path.resolve(path.dirname(file), via[1]);
  }
  throw new Error(`could not find the slides array starting from ${file}`);
}

/* A written slide has to be a slide before it is allowed near the file.
   This is the last gate: the panel builds the text, but the panel runs
   in a browser and the browser is not to be trusted with a write. */
function check(block) {
  if (typeof block !== "string" || block.length > 200_000)
    throw new Error("the slide must be a string, and a reasonable one");
  let value;
  try {
    value = new Function(`return (${block})`)();
  } catch (err) {
    throw new Error(`that slide will not parse: ${err.message}`);
  }
  if (!value || typeof value !== "object")
    throw new Error("a slide has to be an object");
  return value;
}

/* ------------------------------------------------------------------
   Pictures
------------------------------------------------------------------ */

const PICTURE = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
const PICTURE_MAX = 20 * 1024 * 1024;

/* A dropped file goes under public/slides/, named after itself but
   tamed — lower case, dashes, its real extension — and never over a
   file that is already there. What comes back is the `image:` path the
   deck will use, relative to public/, which is all the wall needs. */
async function savePicture(root, body) {
  const ext = PICTURE[body.type];
  if (!ext)
    throw new Error("that is not a picture the wall can show — PNG, JPEG, GIF or WebP");
  if (typeof body.data !== "string") throw new Error("no picture data");
  const bytes = Buffer.from(body.data, "base64");
  if (!bytes.length) throw new Error("the picture was empty");
  if (bytes.length > PICTURE_MAX) throw new Error("that picture is over 20 MB");

  const given = String(body.name || "picture");
  const base =
    path
      .basename(given, path.extname(given))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "picture";

  const dir = path.join(root, "public", "slides");
  await mkdir(dir, { recursive: true });
  let file = path.join(dir, base + ext);
  for (let n = 2; existsSync(file); n++) file = path.join(dir, `${base}-${n}${ext}`);
  await writeFile(file, bytes);
  return { path: path.posix.join("slides", path.basename(file)), bytes: bytes.length };
}

/* ------------------------------------------------------------------
   The wire
------------------------------------------------------------------ */

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

const readBody = (req, limit) =>
  new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) fail(new Error("that is too much to take in one request"));
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        fail(new Error("the body was not JSON"));
      }
    });
    req.on("error", fail);
  });

/** @returns {import("vite").Plugin} */
export function deckEditor() {
  /* A write the editor asked for quietly — the wall already shows what
     was written, so the page must not be rebuilt over it. The watcher
     may report one write more than once, so the mark is a moment, not
     a flag: anything the watcher says about that file within a second
     or two of the write is the write. */
  const quiet = new Map();
  const QUIET_MS = 1500;

  /* One write at a time. Two requests that both read the file before
     either has written it would each write its own edit over the
     other's — and a quiet save landing a moment before "+ Add" is
     exactly that pair. */
  let turn = Promise.resolve();
  const inTurn = (work) => {
    const next = turn.then(work, work);
    turn = next.catch(() => {});
    return next;
  };

  return {
    name: "storyboard:deck-editor",
    apply: "serve",

    hotUpdate({ file }) {
      const at = quiet.get(file);
      if (at != null && Date.now() - at < QUIET_MS) return [];
      quiet.delete(file);
      return undefined;
    },

    configureServer(server) {
      const root = server.config.root;

      server.middlewares.use("/__deck", async (req, res) => {
        /* Only from the page this server is serving. A dev server is
           reachable by anything on the machine — including a page in
           another tab — and this endpoint writes to disk. */
        const origin = req.headers.origin;
        if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin))
          return send(res, 403, { error: "not from this machine" });
        if (req.method !== "POST")
          return send(res, 405, { error: "POST only" });

        try {
          if (req.url === "/asset") {
            const body = await readBody(req, PICTURE_MAX * 1.4);
            const out = await savePicture(root, body);
            return send(res, 200, { ok: true, ...out, note: `saved public/${out.path}` });
          }

          const body = await readBody(req, 400_000);
          await inTurn(async () => {
            const { file, src } = await findDeck(root);
            const before = slideSpans(src).spans.length;
            const at = Number(body.slide) - 1; // slides are 1-based on the wall

            let next, note, removed;
            if (req.url === "/save") {
              check(body.block);
              next = replaceSlide(src, at, body.block);
              note = `slide ${at + 1} written`;
            } else if (req.url === "/add") {
              check(body.block);
              /* The slide being stood on may carry edits that were
                 never written. They come along in `current`, and go
                 in with the same write — the reload that follows would
                 otherwise throw them away. */
              let base = src;
              if (body.current != null) {
                check(body.current);
                base = replaceSlide(src, at, body.current);
              }
              next = insertSlide(base, at, body.block);
              note = at < 0 ? "slide added at the front" : `slide added after ${at + 1}`;
            } else if (req.url === "/remove") {
              // what is taken out goes back in the answer, so an undo can
              // put back exactly that: the comment above it, the order the
              // author wrote the fields in, all of it
              removed = slideText(src, at);
              next = removeSlide(src, at);
              note = `slide ${at + 1} removed`;
            } else if (req.url === "/move") {
              const to = Number(body.to) - 1;
              next = moveSlide(src, at, to);
              note = `slide ${at + 1} moved to ${to + 1}`;
            } else if (req.url === "/deck") {
              /* The deck's own fields — the room it hangs in. Only the
                 fields the panel is meant to set, each as a string or
                 null to take it out; the value goes in as a string
                 literal, so nothing the browser sends is ever code. */
              const set = body.set && typeof body.set === "object" ? body.set : {};
              next = src;
              const written = [];
              for (const [key, value] of Object.entries(set)) {
                if (!["room", "wall", "floor", "light"].includes(key))
                  throw new Error(`the panel may not set ${key}`);
                if (value != null && typeof value !== "string")
                  throw new Error(`${key} must be a string, or null to take it out`);
                next = setDeckField(next, key, value == null ? null : JSON.stringify(value));
                written.push(key);
              }
              note = written.length ? `${written.join(", ")} written` : "nothing to write";
            } else {
              return send(res, 404, { error: `no ${req.url} here` });
            }

            /* Read the result back the same way before it is committed
               to disk. A file that will not scan is a file the author
               has to repair by hand, and the whole point of this was to
               save them that. */
            const after = slideSpans(next).spans.length;
            const want = before + (req.url === "/add" ? 1 : req.url === "/remove" ? -1 : 0);
            if (after !== want)
              throw new Error(
                `refusing to write: that would have left ${after} slides, not ${want}`,
              );

            /* A loud write clears the mark a quiet one left: the page
               must be rebuilt for this one even if a keystroke was
               saved a moment ago. */
            if (body.quiet) quiet.set(file, Date.now());
            else quiet.delete(file);
            await writeFile(file, next, "utf8");
            send(res, 200, {
              ok: true,
              file: path.relative(root, file),
              slides: after,
              note,
              removed,
            });
          });
        } catch (err) {
          send(res, 400, { error: String(err.message || err) });
        }
      });
    },
  };
}
