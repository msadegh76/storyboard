/* Who is here.

   Sign-in is a link by email: no password to store and no app to
   register with anyone. The link's token is hashed at rest, lasts
   fifteen minutes, and works once. What it makes is a session — a
   random id in a cookie, thirty days — and a session is all the
   server ever looks at afterwards.

   A token for a tool (`pnpm push`) is a session too, one that lives a
   year and is sent as a bearer header instead of a cookie.

   Who may sign in: the owner named in the environment, always; anyone
   who already has an account; and, only when signup is open, anyone
   at all. */

import { createHash, randomBytes } from "node:crypto";
import { now } from "./db.js";

export const COOKIE = "storyboard_session";
const LINK_MINUTES = 15;
const SESSION_DAYS = 30;
const TOKEN_DAYS = 365;
const LINKS_PER_HOUR = 5;

export class AuthError extends Error {
  /** @override */
  name = "AuthError";
  /** @param {string} msg @param {number} [status] */
  constructor(msg, status = 400) {
    super(msg);
    this.status = status;
  }
}

const id = (bytes = 24) => randomBytes(bytes).toString("base64url");
const hash = (/** @type {string} */ s) => createHash("sha256").update(s).digest("hex");
const later = (/** @type {number} */ ms) => new Date(Date.now() + ms).toISOString();

/**
 * @typedef {{ id: string, email: string, name: string | null }} User
 */

/**
 * @param {{ db: import("node:sqlite").DatabaseSync, config: import("./config.js").Config, mail: import("./mail.js").Mailer }} deps
 */
export function makeAuth({ db, config, mail }) {
  /** @type {Map<string, number[]>} */
  const asked = new Map();

  const userByEmail = (/** @type {string} */ email) =>
    /** @type {User | undefined} */ (db.prepare("SELECT id, email, name FROM users WHERE email = ?").get(email));

  return {
    cookie: COOKIE,

    /**
     * Ask for a link. Says nothing about whether the address is known.
     * @param {string} rawEmail
     * @param {string} origin where the link points
     * @param {string | null} [next] a path on this site to land on afterwards
     */
    async requestLink(rawEmail, origin, next = null) {
      const email = String(rawEmail || "").trim().toLowerCase();
      /* Something either side of an @. No more than that: a dev server's
         owner is owner@localhost, and a link that goes to the log needs
         no deliverable address. */
      if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 200)
        throw new AuthError("that does not look like an email address");

      const recent = (asked.get(email) ?? []).filter((t) => t > Date.now() - 3600_000);
      if (recent.length >= LINKS_PER_HOUR)
        throw new AuthError("that address has asked for enough links for one hour", 429);
      asked.set(email, [...recent, Date.now()]);

      const known = !!userByEmail(email) || email === config.ownerEmail;
      if (!known && config.signup !== "open")
        throw new AuthError("sign-in on this wall is by invitation", 403);

      const token = id(32);
      db.prepare(
        "INSERT INTO magic_links (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)",
      ).run(hash(token), email, later(LINK_MINUTES * 60_000), now());
      const link = `${origin}/api/auth/callback?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
      await mail.send({
        to: email,
        subject: "Your Storyboard sign-in link",
        text: `Open this link to sign in:\n\n${link}\n\nIt works once, for ${LINK_MINUTES} minutes. If you did not ask for it, ignore this.`,
        link,
      });
      return { email, how: mail.kind };
    },

    /** Turn a link into a session. @returns {{ session: string, user: User }} */
    redeem(/** @type {string} */ token) {
      const row = /** @type {{ email: string, expires_at: string, used_at: string | null } | undefined} */ (
        db.prepare("SELECT email, expires_at, used_at FROM magic_links WHERE token_hash = ?").get(hash(String(token || "")))
      );
      if (!row) throw new AuthError("that link is not one of ours", 400);
      if (row.used_at) throw new AuthError("that link has already been used — ask for another", 400);
      if (row.expires_at < now()) throw new AuthError("that link has expired — ask for another", 400);
      db.prepare("UPDATE magic_links SET used_at = ? WHERE token_hash = ?").run(now(), hash(token));

      let user = userByEmail(row.email);
      if (!user) {
        user = { id: id(12), email: row.email, name: null };
        db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run(
          user.id,
          user.email,
          null,
          now(),
        );
      }
      const session = id(32);
      db.prepare(
        "INSERT INTO sessions (id, user_id, kind, expires_at, created_at) VALUES (?, ?, 'browser', ?, ?)",
      ).run(session, user.id, later(SESSION_DAYS * 86400_000), now());
      return { session, user };
    },

    /** The user a session id belongs to, if it is one and is still good. */
    userOf(/** @type {string | undefined} */ session) {
      if (!session) return null;
      const row = /** @type {(User & { expires_at: string }) | undefined} */ (
        db
          .prepare(
            "SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
          )
          .get(session)
      );
      if (!row || row.expires_at < now()) return null;
      return { id: row.id, email: row.email, name: row.name };
    },

    signOut(/** @type {string | undefined} */ session) {
      if (session) db.prepare("DELETE FROM sessions WHERE id = ?").run(session);
    },

    /** A bearer token for a tool. Shown once. */
    createToken(/** @type {string} */ userId) {
      const token = id(32);
      db.prepare(
        "INSERT INTO sessions (id, user_id, kind, expires_at, created_at) VALUES (?, ?, 'token', ?, ?)",
      ).run(token, userId, later(TOKEN_DAYS * 86400_000), now());
      return token;
    },

    sessionDays: SESSION_DAYS,
  };
}
