/* The hosted server, inside the dev server.

   `pnpm dev` is the wall from the deck file at /, as it always was.
   This plugin adds the hosted wall beside it — /home, /signin, /edit
   and /d — with the same routes as the server on its own, a database
   under .data/, and sign-in links printed to the terminal. So the
   panel's hosted half can be worked on with hot reload, and a deck
   can be tried at a link without building anything.

   Only the paths the app owns are handed to it; everything else is
   Vite's, which is what keeps / the file's wall. */

import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { readConfig } from "./config.js";
import { openDb } from "./db.js";
import { diskStorage } from "./storage.js";
import { logMailer } from "./mail.js";
import { createApp } from "./app.js";

const HOSTED = /^\/(api|d|edit|a|signin|home|welcome|developers)(\/|\?|$)/;

/** @returns {import("vite").Plugin} */
export function hosted() {
  return {
    name: "storyboard:hosted",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      const config = readConfig(process.env, {
        dev: true,
        root,
        // a dev server is its developer's own: any address may sign in,
        // and the link prints here anyway. SIGNUP=closed keeps it to the owner.
        ownerEmail: (process.env.OWNER_EMAIL || "owner@localhost").trim().toLowerCase(),
        signup: process.env.SIGNUP === "closed" ? "closed" : "open",
      });
      mkdirSync(config.dataDir, { recursive: true });
      const db = openDb(path.join(config.dataDir, "storyboard.db"));
      const storage = diskStorage(path.join(config.dataDir, "assets"));
      const app = createApp({
        config,
        db,
        storage,
        mail: logMailer(),
        // the page as Vite would serve it: /src/main.ts, the HMR client, all of it
        shell: async (url) =>
          server.transformIndexHtml(url, await readFile(path.join(root, "index.html"), "utf8")),
      });
      const listener = getRequestListener(app.fetch);
      server.middlewares.use((req, res, next) => {
        if (!HOSTED.test(req.url ?? "")) return next();
        void listener(req, res);
      });
      server.config.logger.info(
        config.signup === "open"
          ? "  storyboard: hosted wall at /home — sign in with any address; the link prints here"
          : `  storyboard: hosted wall at /home — sign in as ${config.ownerEmail}; the link prints here`,
      );
    },
  };
}
