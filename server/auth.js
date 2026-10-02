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
   at all.

   A guest is an account with no address yet: made on the spot so a
   stranger can build a wall before being asked who they are. Their
   address is `guest:<id>`, which no mail can reach, and their session
   is short. Redeeming a link while holding a guest session *claims*
   it: the guest becomes that person, decks and all — or, if the
   address already has an account, the decks move over to it. */

import { createHash, randomBytes } from "node:crypto";
import { now } from "./db.js";

export const COOKIE = "storyboard_session";
const LINK_MINUTES = 15;
const SESSION_DAYS = 30;
const GUEST_DAYS = 7;
const TOKEN_DAYS = 365;
const LINKS_PER_HOUR = 5;
/* How much of a token is shown so its owner can tell it from another.
   Eight characters of base64url is forty-eight bits: enough that two
   of one person's tokens will never share a prefix, and far too few to
   be any use to somebody who sees one over a shoulder. */
const PREFIX = 8;
const SEEN_EVERY = 3600_000;

/** A guest's address: unreachable, and recognisable. */
export const isGuest = (
  /** @type {{ email: string } | null | undefined} */ u,
) => !!u && u.email.startsWith("guest:");

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
const hash = (/** @type {string} */ s) =>
  createHash("sha256").update(s).digest("hex");
const later = (/** @type {number} */ ms) =>
  new Date(Date.now() + ms).toISOString();

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
    /** @type {User | undefined} */ (
      db.prepare("SELECT id, email, name FROM users WHERE email = ?").get(email)
    );

  return {
    cookie: COOKIE,

    /**
     * Ask for a link. Says nothing about whether the address is known.
     * @param {string} rawEmail
     * @param {string} origin where the link points
     * @param {string | null} [next] a path on this site to land on afterwards
     */
    async requestLink(rawEmail, origin, next = null) {
      const email = String(rawEmail || "")
        .trim()
        .toLowerCase();
      /* Something either side of an @. No more than that: a dev server's
         owner is owner@localhost, and a link that goes to the log needs
         no deliverable address. */
      if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 200)
        throw new AuthError("that does not look like an email address");

      const recent = (asked.get(email) ?? []).filter(
        (t) => t > Date.now() - 3600_000,
      );
      if (recent.length >= LINKS_PER_HOUR)
        throw new AuthError(
          "that address has asked for enough links for one hour",
          429,
        );
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

    /**
     * Turn a link into a session. If the one redeeming it is a guest,
     * the guest is claimed: their decks are that person's now.
     * @param {string} token
     * @param {User | null} [holder] whoever holds the session the link was opened with
     * @returns {{ session: string, user: User, claimed: boolean }}
     */
    redeem(token, holder = null) {
      const row =
        /** @type {{ email: string, expires_at: string, used_at: string | null } | undefined} */ (
          db
            .prepare(
              "SELECT email, expires_at, used_at FROM magic_links WHERE token_hash = ?",
            )
            .get(hash(String(token || "")))
        );
      if (!row) throw new AuthError("that link is not one of ours", 400);
      if (row.used_at)
        throw new AuthError(
          "that link has already been used — ask for another",
          400,
        );
      if (row.expires_at < now())
        throw new AuthError("that link has expired — ask for another", 400);
      db.prepare("UPDATE magic_links SET used_at = ? WHERE token_hash = ?").run(
        now(),
        hash(token),
      );

      let user = userByEmail(row.email);
      let claimed = false;
      if (holder && isGuest(holder)) {
        claimed = true;
        if (user) {
          // the address already has an account: the guest's decks go to it
          db.prepare("UPDATE decks SET owner_id = ? WHERE owner_id = ?").run(
            user.id,
            holder.id,
          );
          db.prepare("DELETE FROM users WHERE id = ?").run(holder.id);
        } else {
          // the guest simply becomes this person, decks and all
          db.prepare("UPDATE users SET email = ? WHERE id = ?").run(
            row.email,
            holder.id,
          );
          user = { id: holder.id, email: row.email, name: null };
        }
      }
      if (!user) {
        user = { id: id(12), email: row.email, name: null };
        db.prepare(
          "INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
        ).run(user.id, user.email, null, now());
      }
      const session = id(32);
      db.prepare(
        "INSERT INTO sessions (id, user_id, kind, expires_at, created_at) VALUES (?, ?, 'browser', ?, ?)",
      ).run(session, user.id, later(SESSION_DAYS * 86400_000), now());
      return { session, user, claimed };
    },

    /** An account with no address yet, and a short session for it. */
    guest() {
      const uid = id(12);
      const user = { id: uid, email: `guest:${uid}`, name: null };
      db.prepare(
        "INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
      ).run(user.id, user.email, null, now());
      const session = id(32);
      db.prepare(
        "INSERT INTO sessions (id, user_id, kind, expires_at, created_at) VALUES (?, ?, 'guest', ?, ?)",
      ).run(session, user.id, later(GUEST_DAYS * 86400_000), now());
      return { session, user };
    },

    /** Guests nobody claimed, older than a month: gone, decks and all. Answers with their deck ids. */
    sweepGuests(days = 30) {
      const before = new Date(Date.now() - days * 86400_000).toISOString();
      const stale = /** @type {{ id: string }[]} */ (
        db
          .prepare(
            "SELECT id FROM users WHERE email LIKE 'guest:%' AND created_at < ?",
          )
          .all(before)
      );
      /** @type {string[]} */
      const gone = [];
      for (const u of stale) {
        for (const d of /** @type {{ id: string }[]} */ (
          db.prepare("SELECT id FROM decks WHERE owner_id = ?").all(u.id)
        ))
          gone.push(d.id);
        db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
      }
      return gone;
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

    /* ---- the tokens a person has out, and taking one back ---- */

    /** Enough of each to tell them apart — never the whole of one. */
    tokens(/** @type {string} */ userId) {
      return /** @type {{ prefix: string, created_at: string, expires_at: string, last_seen: string | null }[]} */ (
        db
          .prepare(
            `SELECT substr(id, 1, ?) AS prefix, created_at, expires_at, last_seen
             FROM sessions WHERE user_id = ? AND kind = 'token' AND expires_at > ?
             ORDER BY created_at DESC`,
          )
          .all(PREFIX, userId, now())
      );
    },

    /* Matched with substr rather than LIKE: base64url contains `_`,
       which LIKE reads as "any character", so a prefix would quietly
       match more tokens than the one meant. */
    /** Take one back. It stops working at once, wherever it is. */
    revoke(/** @type {string} */ userId, /** @type {string} */ prefix) {
      if (!new RegExp(`^[A-Za-z0-9_-]{${PREFIX}}$`).test(String(prefix || "")))
        throw new AuthError("that is not one of your tokens", 404);
      const out = db
        .prepare("DELETE FROM sessions WHERE user_id = ? AND kind = 'token' AND substr(id, 1, ?) = ?")
        .run(userId, PREFIX, prefix);
      if (!out.changes) throw new AuthError("that is not one of your tokens", 404);
    },

    /* Written at most once an hour, in one statement with no read
       first, so noting it costs a used token almost nothing. */
    /** Note that a token was used, so its owner can see which are idle. */
    touch(/** @type {string | undefined} */ session) {
      if (!session) return;
      db.prepare(
        `UPDATE sessions SET last_seen = ? WHERE id = ? AND kind = 'token'
         AND (last_seen IS NULL OR last_seen < ?)`,
      ).run(now(), session, new Date(Date.now() - SEEN_EVERY).toISOString());
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
    tokenDays: TOKEN_DAYS,
    prefix: PREFIX,
  };
}
