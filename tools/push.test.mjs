/* pnpm push, against a server that is really listening: a deck in a
   file goes up with its pictures, is published, and goes up again
   onto the same address rather than a new one. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import { createApp } from "../server/app.js";
import { openDb } from "../server/db.js";
import { diskStorage } from "../server/storage.js";
import { readConfig, ROOT } from "../server/config.js";
import { readDeckModule } from "./deck-json.mjs";
import { slugify } from "../server/decks.js";

const run = promisify(execFile);

test("a deck pushed from a checkout is the deck at the link", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storyboard-push-"));
  const links = [];
  const config = readConfig({}, { baseUrl: "http://127.0.0.1", dataDir: dir, distDir: dir, root: ROOT, ownerEmail: "owner@wall.test" });
  const app = createApp({
    config,
    db: openDb(":memory:"),
    storage: diskStorage(path.join(dir, "assets")),
    mail: { kind: "log", async send(m) { links.push(m.link); } },
    shell: async () => "<html><head><title>Storyboard</title></head><body></body></html>",
  });
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise((r) => server.once("listening", r));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  const host = `http://127.0.0.1:${port}`;
  config.baseUrl = host;

  try {
    // a token, the way the home page hands one out
    const asked = await fetch(`${host}/api/auth/link`, { method: "POST", headers: { origin: host, "content-type": "application/json" }, body: JSON.stringify({ email: "owner@wall.test" }) });
    assert.equal(asked.status, 200);
    const back = await fetch(links.pop(), { redirect: "manual" });
    const cookie = /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie"))?.[1];
    const { token } = await (await fetch(`${host}/api/auth/token`, { method: "POST", headers: { origin: host, cookie: `storyboard_session=${cookie}`, "content-type": "application/json" }, body: "{}" })).json();
    assert.ok(token);

    const deckFile = "examples/hello-wall/deck.config.js";
    const local = await readDeckModule(path.join(ROOT, deckFile));
    // the address comes from the deck's title, as it does on the home page
    const slug = slugify(local.title);

    const first = await run("node", ["tools/push.mjs", "--to", host, "--deck", deckFile, "--publish", "--token", token], { cwd: ROOT });
    assert.match(first.stdout, new RegExp(`^made http://127\\.0\\.0\\.1:\\d+/d/${slug}$`, "m"));
    assert.match(first.stdout, /demo\/.*→ [0-9a-f]{20}\.webp/);
    assert.match(first.stdout, new RegExp(`draft written: ${local.slides.length} slides`));
    assert.match(first.stdout, /^published: /m);

    const published = await (await fetch(`${host}/d/${slug}/deck.json`)).json();
    assert.equal(published.slides.length, local.slides.length);
    assert.equal(published.title, local.title);
    const images = JSON.stringify(published).match(/"image":"([^"]+)"/g) ?? [];
    assert.ok(images.length > 0);
    for (const im of images) assert.match(im, /"image":"[0-9a-f]{20}\.webp"/);

    // the picture is really there
    const file = images[0].split('"')[3];
    const { id } = (await (await fetch(`${host}/api/decks`, { headers: { authorization: `Bearer ${token}` } })).json()).decks[0];
    const pic = await fetch(`${host}/a/${id}/${file}`);
    assert.equal(pic.status, 200);
    assert.equal(pic.headers.get("content-type"), "image/webp");

    // again: the same address, not a second deck; not published this time
    const second = await run("node", ["tools/push.mjs", "--to", host, "--deck", deckFile, "--token", token], { cwd: ROOT });
    assert.doesNotMatch(second.stdout, /^made /m);
    assert.match(second.stdout, new RegExp(`edit it at .*/edit/${slug}`));
    const { decks } = await (await fetch(`${host}/api/decks`, { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(decks.length, 1);
    assert.equal(decks[0].dirty, false, "the same deck pushed twice is not a change");

    // no token, no push
    await assert.rejects(run("node", ["tools/push.mjs", "--to", host, "--deck", deckFile], { cwd: ROOT, env: { ...process.env, STORYBOARD_TOKEN: "" } }), /usage/);
    await assert.rejects(run("node", ["tools/push.mjs", "--to", host, "--deck", deckFile, "--token", "bogus"], { cwd: ROOT }), /sign in first/);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
