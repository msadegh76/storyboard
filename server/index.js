/* The server, on its own, in front of the built wall.

     pnpm build
     OWNER_EMAIL=you@example.com pnpm serve

   Everything it needs is in the environment — see config.js — and
   everything it keeps is under DATA_DIR: the database and the
   pictures. With no mail configured, sign-in links are printed here. */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { readConfig } from "./config.js";
import { openDb } from "./db.js";
import { diskStorage } from "./storage.js";
import { logMailer, resendMailer } from "./mail.js";
import { createApp } from "./app.js";

const config = readConfig();
const shellFile = path.join(config.distDir, "index.html");
if (!existsSync(shellFile)) {
  console.error(`storyboard: no ${shellFile} — run pnpm build first`);
  process.exit(1);
}
if (!config.ownerEmail && config.signup !== "open")
  console.warn("storyboard: OWNER_EMAIL is not set and SIGNUP is not open — nobody can sign in");
if (!config.mail.resendKey)
  console.warn(
    "storyboard: no RESEND_API_KEY — sign-in links will be printed here, not mailed. Fine for one owner; set it before opening the wall to others. See README, Mail.",
  );

mkdirSync(config.dataDir, { recursive: true });
const html = readFileSync(shellFile, "utf8");
const db = openDb(path.join(config.dataDir, "storyboard.db"));
const storage = diskStorage(path.join(config.dataDir, "assets"));
const mail = config.mail.resendKey ? resendMailer(config.mail.resendKey, config.mail.from) : logMailer();
const app = createApp({ config, db, storage, mail, shell: async () => html });

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`storyboard: listening on ${info.address}:${info.port}, as ${config.baseUrl}`);
  console.log(`storyboard: data in ${config.dataDir}; sign-in links are ${mail.kind === "log" ? "printed here" : "mailed"}`);
});
