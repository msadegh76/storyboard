/* What the server is told, and what it assumes when told nothing.

   Everything comes from the environment, so one container runs
   anywhere: a data directory, an address, an owner, and — optionally —
   a way to send mail. Nothing here is secret except what the
   environment holds. */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** The project root: where dist/, public/ and examples/ are. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MB = 1024 * 1024;

/**
 * @typedef {object} Config
 * @property {number} port
 * @property {string} host
 * @property {string} baseUrl the public address, with no trailing slash
 * @property {string} dataDir where the database and the pictures live
 * @property {string} distDir the built wall
 * @property {string} root the project, for the examples and their pictures
 * @property {string} ownerEmail who may sign in first
 * @property {"open"|"closed"} signup whether anyone else may
 * @property {{ resendKey: string; from: string }} mail
 * @property {boolean} dev running inside the Vite dev server
 * @property {boolean} secureCookies
 * @property {{ decksPerUser: number; picturesPerDeck: number; bytesPerUser: number; pictureBytes: number; deckBytes: number }} quota
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {Partial<Config>} [over]
 * @returns {Config}
 */
export function readConfig(env = process.env, over = {}) {
  const port = Number(env.PORT) || 8787;
  const baseUrl = (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");
  const num = (/** @type {string | undefined} */ v, /** @type {number} */ d) =>
    v && Number.isFinite(Number(v)) ? Number(v) : d;
  return {
    port,
    host: env.HOST || "0.0.0.0",
    baseUrl,
    dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, ".data")),
    distDir: path.resolve(env.DIST_DIR || path.join(ROOT, "dist")),
    root: ROOT,
    /* A wall being tried out locally has an owner by default, so
       `pnpm serve` after `pnpm build` signs in with nothing set. In
       production nothing is assumed: an unset owner means nobody. */
    ownerEmail: (env.OWNER_EMAIL || (env.NODE_ENV === "production" ? "" : "owner@localhost"))
      .trim()
      .toLowerCase(),
    signup: env.SIGNUP === "open" ? "open" : "closed",
    mail: { resendKey: env.RESEND_API_KEY || "", from: env.MAIL_FROM || "Storyboard <storyboard@localhost>" },
    dev: false,
    secureCookies: baseUrl.startsWith("https://"),
    quota: {
      decksPerUser: num(env.QUOTA_DECKS, 50),
      picturesPerDeck: num(env.QUOTA_PICTURES, 200),
      bytesPerUser: num(env.QUOTA_MB, 512) * MB,
      pictureBytes: num(env.QUOTA_PICTURE_MB, 20) * MB,
      deckBytes: 256 * 1024,
    },
    ...over,
  };
}
