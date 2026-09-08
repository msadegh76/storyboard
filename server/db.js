/* The database: one SQLite file, opened through what Node ships.

   A deck is a document. The draft is one JSON blob and the published
   copy another, each with a revision number; every published version
   is kept whole. Nothing is normalized because nothing asks for it — a
   deck is a few kilobytes, every edit replaces one slide in the whole,
   and publishing is a copy. See decks.js for the reads and writes. */

import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL DEFAULT 'browser',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen  TEXT
  );
  CREATE TABLE magic_links (
    token_hash TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE decks (
    id            TEXT PRIMARY KEY,
    owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug          TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    visibility    TEXT NOT NULL DEFAULT 'public',
    draft         TEXT NOT NULL,
    draft_rev     INTEGER NOT NULL DEFAULT 1,
    published     TEXT,
    published_rev INTEGER,
    published_at  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE INDEX decks_owner ON decks(owner_id);
  CREATE TABLE versions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id      TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    rev          INTEGER NOT NULL,
    json         TEXT NOT NULL,
    published_at TEXT NOT NULL,
    note         TEXT NOT NULL DEFAULT '',
    UNIQUE(deck_id, rev)
  );
  CREATE TABLE assets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    file       TEXT NOT NULL,
    mime       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    width      INTEGER,
    height     INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE(deck_id, file)
  );
  `,
];

/**
 * Open the database, creating it and bringing it up to date.
 * @param {string} file a path, or ":memory:" for a test
 */
export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("CREATE TABLE IF NOT EXISTS migrations (n INTEGER PRIMARY KEY, at TEXT NOT NULL)");
  const done = new Set(
    /** @type {{n: number}[]} */ (db.prepare("SELECT n FROM migrations").all()).map((r) => r.n),
  );
  MIGRATIONS.forEach((sql, i) => {
    const n = i + 1;
    if (done.has(n)) return;
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO migrations (n, at) VALUES (?, ?)").run(n, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  });
  return db;
}

/**
 * Run work inside one transaction. A throw rolls it back and is
 * rethrown; anything returned is returned.
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} work
 * @returns {T}
 */
export function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = work();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const now = () => new Date().toISOString();
