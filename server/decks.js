/* Decks: every read and write the server makes against them.

   The draft and the published copy are JSON text in one row. Every
   write to the draft carries the revision it was made against and
   goes through `applyOp`, which does the read, the change, the check
   and the write inside one transaction — so two windows cannot write
   over each other, and a document that will not check never reaches
   the row. Publishing is a copy within the same row, plus one version
   kept whole. */

import { randomBytes } from "node:crypto";
import { transaction, now } from "./db.js";
import { canonical, describeChanges } from "./ops.js";
import { checkDeck, ValidationError } from "./validate.js";
import { sizePicture } from "./assets.js";

/** @typedef {import("../src/deck/types.ts").Deck} Deck */

export class HttpError extends Error {
  /** @override */
  name = "HttpError";
  /** @param {number} status @param {string} msg @param {Record<string, unknown>} [extra] */
  constructor(status, msg, extra = {}) {
    super(msg);
    this.status = status;
    this.extra = extra;
  }
}

const RESERVED = new Set([
  "api", "a", "d", "edit", "present", "signin", "signout", "home", "assets", "demo",
  "favicon.svg", "icons.svg", "new", "admin", "static", "public", "src",
]);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;

/** A title, as an address. */
export function slugify(/** @type {string} */ s) {
  const base = String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return base.length >= 3 ? base : `${base}${base ? "-" : ""}wall`.replace(/^-/, "");
}

const newId = () => randomBytes(8).toString("hex");

/**
 * @typedef {object} DeckRow
 * @property {string} id
 * @property {string} owner_id
 * @property {string} slug
 * @property {string} title
 * @property {"public"|"unlisted"|"private"} visibility
 * @property {string} draft
 * @property {number} draft_rev
 * @property {string | null} published
 * @property {number | null} published_rev
 * @property {string | null} published_at
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {{ db: import("node:sqlite").DatabaseSync, storage: import("./storage.js").Storage, config: import("./config.js").Config }} deps
 */
export function makeDecks({ db, storage, config }) {
  const q = {
    byId: db.prepare("SELECT * FROM decks WHERE id = ?"),
    bySlug: db.prepare("SELECT * FROM decks WHERE slug = ?"),
    slugTaken: db.prepare("SELECT 1 FROM decks WHERE slug = ? AND id <> ?"),
    ofUser: db.prepare("SELECT * FROM decks WHERE owner_id = ? ORDER BY updated_at DESC"),
    countOf: db.prepare("SELECT COUNT(*) AS n FROM decks WHERE owner_id = ?"),
    insert: db.prepare(
      "INSERT INTO decks (id, owner_id, slug, title, visibility, draft, draft_rev, created_at, updated_at) VALUES (?, ?, ?, ?, 'public', ?, 1, ?, ?)",
    ),
    writeDraft: db.prepare(
      "UPDATE decks SET draft = ?, draft_rev = draft_rev + 1, title = ?, updated_at = ? WHERE id = ? AND draft_rev = ?",
    ),
    publish: db.prepare(
      "UPDATE decks SET published = draft, published_rev = draft_rev, published_at = ?, updated_at = ? WHERE id = ? AND draft_rev = ?",
    ),
    version: db.prepare(
      "INSERT INTO versions (deck_id, rev, json, published_at, note) VALUES (?, ?, ?, ?, ?)",
    ),
    versions: db.prepare(
      "SELECT rev, published_at AS at, note FROM versions WHERE deck_id = ? ORDER BY rev DESC",
    ),
    versionJson: db.prepare("SELECT json FROM versions WHERE deck_id = ? AND rev = ?"),
    settings: db.prepare(
      "UPDATE decks SET title = ?, slug = ?, visibility = ?, updated_at = ? WHERE id = ?",
    ),
    remove: db.prepare("DELETE FROM decks WHERE id = ?"),
    assetInsert: db.prepare(
      "INSERT OR IGNORE INTO assets (deck_id, file, mime, bytes, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ),
    assetCount: db.prepare("SELECT COUNT(*) AS n FROM assets WHERE deck_id = ?"),
    assetOne: db.prepare("SELECT mime, bytes FROM assets WHERE deck_id = ? AND file = ?"),
    bytesOfUser: db.prepare(
      "SELECT COALESCE(SUM(a.bytes), 0) AS n FROM assets a JOIN decks d ON d.id = a.deck_id WHERE d.owner_id = ?",
    ),
  };

  const get = (/** @type {string} */ id) => /** @type {DeckRow | undefined} */ (q.byId.get(id));
  const bySlug = (/** @type {string} */ slug) => /** @type {DeckRow | undefined} */ (q.bySlug.get(slug));
  const must = (/** @type {string} */ id) => {
    const row = get(id);
    if (!row) throw new HttpError(404, "no such deck");
    return row;
  };

  /** A slug nobody else has, and nothing the server needs for itself. */
  function freeSlug(/** @type {string} */ want, /** @type {string} */ forId) {
    let base = slugify(want);
    if (RESERVED.has(base)) base = `${base}-wall`;
    let slug = base;
    for (let n = 2; q.slugTaken.get(slug, forId); n++) slug = `${base.slice(0, 44)}-${n}`;
    return slug;
  }

  /** What a page or a list needs to know, without the documents. */
  function describe(/** @type {DeckRow} */ row) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      visibility: row.visibility,
      rev: row.draft_rev,
      dirty: row.published !== row.draft,
      published: row.published_rev != null ? { rev: row.published_rev, at: row.published_at } : null,
      url: `${config.baseUrl}/d/${row.slug}`,
      editUrl: `/edit/${row.slug}`,
      assetBase: `/a/${row.id}/`,
      updated_at: row.updated_at,
      published_at: row.published_at,
      slides: /** @type {Deck} */ (JSON.parse(row.draft)).slides.length,
    };
  }

  /**
   * Read the draft, change it, check it, write it — once, in one
   * transaction, and only if nobody wrote in between.
   * @template {Record<string, unknown>} X
   * @param {string} id
   * @param {number | null} rev the revision the writer saw; null skips the check
   * @param {(deck: Deck) => { deck: Deck } & X} change
   */
  function applyOp(id, rev, change) {
    return transaction(db, () => {
      const row = must(id);
      if (rev != null && rev !== row.draft_rev)
        throw new HttpError(409, "This deck changed in another window.", { rev: row.draft_rev });
      let changed;
      try {
        changed = change(/** @type {Deck} */ (JSON.parse(row.draft)));
      } catch (err) {
        // a slide that is not there, a field the panel may not set: the caller's mistake
        if (err instanceof RangeError) throw new HttpError(400, err.message);
        throw err;
      }
      const { deck: next, ...extra } = changed;
      let checked;
      try {
        checked = checkDeck(next, { deckBytes: config.quota.deckBytes });
      } catch (err) {
        if (err instanceof ValidationError) throw new HttpError(400, err.message);
        throw err;
      }
      const text = canonical(checked.deck);
      const out = q.writeDraft.run(text, checked.deck.title || row.title, now(), id, row.draft_rev);
      if (!out.changes) throw new HttpError(409, "This deck changed in another window.");
      return {
        rev: row.draft_rev + 1,
        dirty: text !== row.published,
        slides: checked.deck.slides.length,
        complaints: checked.complaints,
        ...extra,
      };
    });
  }

  return {
    get,
    bySlug,
    must,
    describe,
    applyOp,

    list(/** @type {string} */ userId) {
      return /** @type {DeckRow[]} */ (q.ofUser.all(userId)).map(describe);
    },

    /** @param {string} userId @param {{ title: string, deck: Deck }} o */
    create(userId, o) {
      const n = /** @type {{n: number}} */ (q.countOf.get(userId)).n;
      if (n >= config.quota.decksPerUser)
        throw new HttpError(403, `that is ${config.quota.decksPerUser} decks; delete one first`);
      let checked;
      try {
        checked = checkDeck({ ...o.deck, title: o.title }, { deckBytes: config.quota.deckBytes });
      } catch (err) {
        if (err instanceof ValidationError) throw new HttpError(400, err.message);
        throw err;
      }
      const id = newId();
      const slug = freeSlug(o.title, id);
      const t = now();
      q.insert.run(id, userId, slug, o.title.trim() || "Untitled", canonical(checked.deck), t, t);
      return must(id);
    },

    /** @param {string} id @param {{ title?: string, slug?: string, visibility?: string }} patch */
    settings(id, patch) {
      return transaction(db, () => {
        const row = must(id);
        const title = patch.title != null ? String(patch.title).trim().slice(0, 200) : row.title;
        if (!title) throw new HttpError(400, "a deck needs a title");
        let slug = row.slug;
        if (patch.slug != null) {
          const want = String(patch.slug).trim().toLowerCase();
          if (!SLUG.test(want)) throw new HttpError(400, "an address is 3 to 48 letters, digits and dashes");
          if (RESERVED.has(want)) throw new HttpError(400, "that address is taken");
          if (q.slugTaken.get(want, id)) throw new HttpError(409, "that address is taken");
          slug = want;
        }
        const visibility = patch.visibility ?? row.visibility;
        if (!["public", "unlisted", "private"].includes(visibility))
          throw new HttpError(400, "visibility is public, unlisted or private");
        q.settings.run(title, slug, visibility, now(), id);
        if (title !== row.title) {
          // the title lives in the document too; the two must not part
          const deck = /** @type {Deck} */ (JSON.parse(row.draft));
          deck.title = title;
          q.writeDraft.run(canonical(deck), title, now(), id, row.draft_rev);
        }
        return must(id);
      });
    },

    async remove(/** @type {string} */ id) {
      must(id);
      q.remove.run(id);
      await storage.deleteAll(id);
    },

    /** @param {string} id @param {number | null} rev */
    publish(id, rev) {
      return transaction(db, () => {
        const row = must(id);
        if (rev != null && rev !== row.draft_rev)
          throw new HttpError(409, "This deck changed in another window.", { rev: row.draft_rev });
        const t = now();
        if (row.published === row.draft && row.published_rev != null)
          return { publishedRev: row.published_rev, at: row.published_at, url: `${config.baseUrl}/d/${row.slug}`, rev: row.draft_rev, dirty: false };
        q.publish.run(t, t, id, row.draft_rev);
        const deck = /** @type {Deck} */ (JSON.parse(row.draft));
        q.version.run(id, row.draft_rev, row.draft, t, `${deck.slides.length} slide${deck.slides.length === 1 ? "" : "s"}`);
        return { publishedRev: row.draft_rev, at: t, url: `${config.baseUrl}/d/${row.slug}`, rev: row.draft_rev, dirty: false };
      });
    },

    /** Put the published copy back into the draft. */
    discard(/** @type {string} */ id) {
      const row = must(id);
      if (row.published == null) throw new HttpError(400, "nothing has been published to go back to");
      const was = /** @type {Deck} */ (JSON.parse(row.draft));
      const out = applyOp(id, null, () => ({ deck: /** @type {Deck} */ (JSON.parse(/** @type {string} */ (row.published))) }));
      return { ...out, was };
    },

    versions(/** @type {string} */ id) {
      must(id);
      return /** @type {{ rev: number, at: string, note: string }[]} */ (q.versions.all(id));
    },

    /** Load a published version into the draft. Nothing public changes. */
    restore(/** @type {string} */ id, /** @type {number} */ rev) {
      const row = must(id);
      const v = /** @type {{ json: string } | undefined} */ (q.versionJson.get(id, rev));
      if (!v) throw new HttpError(404, `no version ${rev}`);
      const was = /** @type {Deck} */ (JSON.parse(row.draft));
      const out = applyOp(id, null, () => ({ deck: /** @type {Deck} */ (JSON.parse(v.json)) }));
      return { ...out, was };
    },

    changes(/** @type {string} */ id) {
      const row = must(id);
      return describeChanges(
        row.published ? /** @type {Deck} */ (JSON.parse(row.published)) : null,
        /** @type {Deck} */ (JSON.parse(row.draft)),
      );
    },

    /**
     * A picture, kept with the deck. Resolves to what the card's
     * `image:` should say.
     * @param {string} id @param {Buffer} input
     */
    async addPicture(id, input) {
      const row = must(id);
      if (input.length > config.quota.pictureBytes)
        throw new HttpError(413, `that picture is over ${Math.round(config.quota.pictureBytes / 1048576)} MB`);
      const count = /** @type {{n: number}} */ (q.assetCount.get(id)).n;
      if (count >= config.quota.picturesPerDeck)
        throw new HttpError(403, `that is ${config.quota.picturesPerDeck} pictures on one deck`);
      const used = /** @type {{n: number}} */ (q.bytesOfUser.get(row.owner_id)).n;
      if (used >= config.quota.bytesPerUser)
        throw new HttpError(403, "the pictures on your decks have reached their limit");
      let sized;
      try {
        sized = await sizePicture(input);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : String(err));
      }
      await storage.put(`${id}/${sized.file}`, sized.data);
      q.assetInsert.run(id, sized.file, sized.mime, sized.bytes, sized.width, sized.height, now());
      return { path: sized.file, width: sized.width, height: sized.height, bytes: sized.bytes };
    },

    /** The stored picture, for serving. */
    async picture(/** @type {string} */ id, /** @type {string} */ file) {
      const meta = /** @type {{ mime: string, bytes: number } | undefined} */ (q.assetOne.get(id, file));
      if (!meta) return null;
      const got = await storage.get(`${id}/${file}`);
      return got ? { ...got, mime: meta.mime } : null;
    },
  };
}
