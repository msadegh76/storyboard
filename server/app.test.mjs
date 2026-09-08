/* The server, end to end, with a database in memory and pictures in a
   temporary directory: sign in, make a deck, edit it one slide at a
   time, publish it, read it as a viewer, take it back, throw it away. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { diskStorage } from "./storage.js";
import { readConfig, ROOT } from "./config.js";

const BASE = "http://wall.test";
const SHELL = `<!doctype html><html><head><title>Storyboard</title><link rel="icon" href="./favicon.svg" /></head><body><script type="module" src="./assets/index-abc.js"></script></body></html>`;

let app, dir, links;

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "storyboard-"));
  links = [];
  const config = readConfig(
    {},
    { baseUrl: BASE, dataDir: dir, distDir: dir, root: ROOT, ownerEmail: "owner@wall.test", signup: "closed" },
  );
  app = createApp({
    config,
    db: openDb(":memory:"),
    storage: diskStorage(path.join(dir, "assets")),
    mail: { kind: "log", async send(m) { links.push(m.link); } },
    shell: async () => SHELL,
  });
});
after(() => rm(dir, { recursive: true, force: true }));

/* One request, from this site, as someone — or nobody. */
const call = (route, { method = "GET", body, cookie, bearer, form, raw } = {}) => {
  const headers = { origin: BASE };
  if (cookie) headers.cookie = `storyboard_session=${cookie}`;
  if (bearer) {
    headers.authorization = `Bearer ${bearer}`;
    delete headers.origin;
  }
  let payload = raw;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  }
  return app.request(`${BASE}${route}`, { method, headers, body: payload });
};
const json = async (res) => ({ status: res.status, ...(await res.json()) });

async function signIn(email) {
  const asked = await call("/api/auth/link", { method: "POST", body: { email } });
  assert.equal(asked.status, 200, await asked.text());
  const link = links.pop();
  assert.ok(link.startsWith(`${BASE}/api/auth/callback?token=`));
  const back = await app.request(link);
  assert.equal(back.status, 302);
  const cookie = /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie") || "")?.[1];
  assert.ok(cookie, "a session cookie");
  assert.match(back.headers.get("set-cookie"), /HttpOnly/);
  return cookie;
}

let owner, deckId, rev;

test("sign-in is a link, and only the owner may ask for one while signup is closed", async () => {
  const stranger = await call("/api/auth/link", { method: "POST", body: { email: "someone@else.test" } });
  assert.equal(stranger.status, 403);
  const junk = await call("/api/auth/link", { method: "POST", body: { email: "not an address" } });
  assert.equal(junk.status, 400);
  owner = await signIn("Owner@Wall.test");
  const home = await call("/", { cookie: owner });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /owner@wall\.test/);
});

test("a used link is refused, and so is a write from elsewhere", async () => {
  await call("/api/auth/link", { method: "POST", body: { email: "owner@wall.test" } });
  const link = links.pop();
  await app.request(link);
  const again = await app.request(link);
  assert.equal(again.status, 400);
  const elsewhere = await app.request(`${BASE}/api/decks`, {
    method: "POST",
    headers: { origin: "https://evil.test", cookie: `storyboard_session=${owner}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(elsewhere.status, 403);
  const noOrigin = await app.request(`${BASE}/api/decks`, {
    method: "POST",
    headers: { cookie: `storyboard_session=${owner}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(noOrigin.status, 403);
});

test("a deck starts bare, and is edited one slide at a time against a revision", async () => {
  const made = await json(await call("/api/decks", { method: "POST", cookie: owner, body: { title: "The Bakery" } }));
  assert.equal(made.status, 201);
  assert.equal(made.slug, "the-bakery");
  assert.equal(made.url, `${BASE}/d/the-bakery`);
  deckId = made.id;
  rev = made.rev;

  const nothing = await json(await call(`/api/decks/${deckId}/slides/1`, { method: "PUT", cookie: owner, body: { slide: { title: "x" }, rev } }));
  assert.equal(nothing.status, 400, "no slide 1 on a bare wall");

  const added = await json(await call(`/api/decks/${deckId}/slides`, { method: "POST", cookie: owner, body: { after: 0, slide: { title: "One" }, rev } }));
  assert.equal(added.status, 200, added.error);
  assert.equal(added.slides, 1);
  assert.equal(added.dirty, true);
  assert.equal(added.rev, rev + 1);

  const stale = await json(await call(`/api/decks/${deckId}/slides`, { method: "POST", cookie: owner, body: { after: 0, slide: { title: "Late" }, rev } }));
  assert.equal(stale.status, 409);
  assert.equal(stale.rev, rev + 1);
  rev = added.rev;

  const written = await json(await call(`/api/decks/${deckId}/slides/1`, { method: "PUT", cookie: owner, body: { slide: { title: "One", text: "edited", bogus: 1 }, rev } }));
  assert.equal(written.status, 200);
  assert.equal(written.complaints.length, 1);
  rev = written.rev;

  const two = await json(await call(`/api/decks/${deckId}/slides`, { method: "POST", cookie: owner, body: { after: 1, slide: { notes: [{ title: "Two" }, { mural: "Chapter" }] }, current: { title: "One", text: "kept" }, rev } }));
  assert.equal(two.status, 200);
  rev = two.rev;
  const now = await json(await call(`/api/decks/${deckId}`, { cookie: owner }));
  assert.equal(now.deck.slides[0].text, "kept", "`current` came along with the add");
  assert.equal(now.deck.slides.length, 2);

  const bad = await json(await call(`/api/decks/${deckId}/slides/1`, { method: "PUT", cookie: owner, body: { slide: {}, rev } }));
  assert.equal(bad.status, 400);
  const room = await json(await call(`/api/decks/${deckId}/fields`, { method: "PATCH", cookie: owner, body: { set: { room: "night", wall: null }, rev } }));
  assert.equal(room.status, 200);
  rev = room.rev;
  const forbidden = await json(await call(`/api/decks/${deckId}/fields`, { method: "PATCH", cookie: owner, body: { set: { slides: "x" }, rev } }));
  assert.equal(forbidden.status, 400);
});

test("nobody sees a draft; publishing puts it at the link", async () => {
  assert.equal((await call("/d/the-bakery")).status, 404);
  assert.equal((await call("/edit/the-bakery")).status, 302, "sign in first");
  const draft = await call("/edit/the-bakery", { cookie: owner });
  assert.equal(draft.status, 200);
  assert.match(await draft.text(), /"editable":true/);

  const changes = await json(await call(`/api/decks/${deckId}/changes`, { cookie: owner }));
  assert.deepEqual(changes.changes, { added: 2, removed: 0, changed: 0, fields: [] });

  const pub = await json(await call(`/api/decks/${deckId}/publish`, { method: "POST", cookie: owner, body: { rev: rev - 1 } }));
  assert.equal(pub.status, 409, "a stale publish is refused");
  const ok = await json(await call(`/api/decks/${deckId}/publish`, { method: "POST", cookie: owner, body: { rev } }));
  assert.equal(ok.status, 200);
  assert.equal(ok.publishedRev, rev);
  assert.equal(ok.url, `${BASE}/d/the-bakery`);

  const page = await call("/d/the-bakery");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>The Bakery<\/title>/);
  assert.match(html, /"editable":false/);
  assert.match(html, /"assetBase":"\/a\//);
  assert.doesNotMatch(html, /editUrl/, "a viewer is not offered the editor");
  assert.match(html, /src="\/assets\/index-abc\.js"/, "the build's ./assets is served from the root");
  const etag = page.headers.get("etag");
  assert.ok(etag);
  const same = await app.request(`${BASE}/d/the-bakery`, { headers: { "if-none-match": etag } });
  assert.equal(same.status, 304);

  const asOwner = await call("/d/the-bakery", { cookie: owner });
  assert.match(await asOwner.text(), /"editUrl":"\/edit\/the-bakery"/);

  const data = await json(await call("/d/the-bakery/deck.json"));
  assert.equal(data.slides.length, 2);
  assert.equal(data.room, "night");
});

test("a title is text on the page, never markup", async () => {
  const set = await json(await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { title: `<script>alert(1)</script>` } }));
  assert.equal(set.status, 200);
  rev = set.rev;
  await call(`/api/decks/${deckId}/publish`, { method: "POST", cookie: owner, body: { rev } });
  const html = await (await call("/d/the-bakery")).text();
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /\\u003cscript>alert\(1\)\\u003c\/script>/, "the JSON escapes every <");
  const back = await json(await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { title: "The Bakery" } }));
  rev = back.rev;
});

test("changes after a publish can be discarded, and a version restored — each with a way back", async () => {
  const edit = await json(await call(`/api/decks/${deckId}/slides/1`, { method: "PUT", cookie: owner, body: { slide: { title: "One", text: "later" }, rev } }));
  assert.equal(edit.dirty, true);
  rev = edit.rev;
  const home = await (await call("/", { cookie: owner })).text();
  assert.match(home, /unpublished changes/);

  const dropped = await json(await call(`/api/decks/${deckId}/discard`, { method: "POST", cookie: owner, body: {} }));
  assert.equal(dropped.status, 200);
  assert.equal(dropped.dirty, false);
  assert.equal(dropped.was.slides[0].text, "later", "what was discarded comes back, for an undo");
  rev = dropped.rev;

  const undo = await json(await call(`/api/decks/${deckId}/draft`, { method: "PUT", cookie: owner, body: { deck: dropped.was, rev } }));
  assert.equal(undo.status, 200);
  assert.equal(undo.dirty, true);
  rev = undo.rev;

  const versions = await json(await call(`/api/decks/${deckId}/versions`, { cookie: owner }));
  assert.equal(versions.versions.length, 2);
  const first = versions.versions[versions.versions.length - 1];
  const restored = await json(await call(`/api/decks/${deckId}/versions/${first.rev}/restore`, { method: "POST", cookie: owner, body: {} }));
  assert.equal(restored.status, 200);
  assert.equal(restored.was.slides[0].text, "later");
  rev = restored.rev;
  const missing = await call(`/api/decks/${deckId}/versions/999/restore`, { method: "POST", cookie: owner, body: {} });
  assert.equal(missing.status, 404);
});

let picture;
test("a picture goes in through sharp and comes out sized, as WebP, at a name that is its content", async () => {
  const png = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#d97a3f" } }).png().toBuffer();
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "wide.png");
  const res = await app.request(`${BASE}/api/decks/${deckId}/assets`, {
    method: "POST",
    headers: { origin: BASE, cookie: `storyboard_session=${owner}` },
    body: form,
  });
  const out = await json(res);
  assert.equal(out.status, 200, out.error);
  assert.match(out.path, /^[0-9a-f]{20}\.webp$/);
  assert.equal(out.width, 2048);
  assert.equal(out.height, 683);
  picture = out.path;

  const again = new FormData();
  again.append("file", new Blob([png], { type: "image/png" }), "same.png");
  const twice = await json(await app.request(`${BASE}/api/decks/${deckId}/assets`, { method: "POST", headers: { origin: BASE, cookie: `storyboard_session=${owner}` }, body: again }));
  assert.equal(twice.path, picture, "the same picture is the same file");

  const served = await call(`/a/${deckId}/${picture}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/webp");
  assert.match(served.headers.get("cache-control"), /immutable/);
  assert.equal((await served.arrayBuffer()).byteLength, out.bytes);

  const notOne = new FormData();
  notOne.append("file", new Blob([Buffer.from("hello")], { type: "image/png" }), "x.png");
  const refused = await app.request(`${BASE}/api/decks/${deckId}/assets`, { method: "POST", headers: { origin: BASE, cookie: `storyboard_session=${owner}` }, body: notOne });
  assert.equal(refused.status, 400);

  const withIt = await json(await call(`/api/decks/${deckId}/slides/2`, { method: "PUT", cookie: owner, body: { slide: { image: picture, caption: "wide" }, rev } }));
  assert.equal(withIt.status, 200, withIt.error);
  rev = withIt.rev;
});

test("private is the owner's alone, unlisted asks not to be indexed", async () => {
  await call(`/api/decks/${deckId}/publish`, { method: "POST", cookie: owner, body: { rev } });
  const priv = await json(await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { visibility: "private" } }));
  assert.equal(priv.visibility, "private");
  assert.equal((await call("/d/the-bakery")).status, 404);
  assert.equal((await call(`/a/${deckId}/${picture}`)).status, 404, "its pictures too");
  assert.equal((await call("/d/the-bakery", { cookie: owner })).status, 200);
  await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { visibility: "unlisted" } });
  const unlisted = await call("/d/the-bakery");
  assert.equal(unlisted.status, 200);
  assert.match(await unlisted.text(), /name="robots" content="noindex"/);
  const address = await json(await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { slug: "bakery" } }));
  assert.equal(address.url, `${BASE}/d/bakery`);
  assert.equal((await call("/d/bakery")).status, 200);
  const taken = await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { slug: "api" } });
  assert.equal(taken.status, 400);
});

test("another author sees nothing of it", async () => {
  // let a second person in
  const open = readConfig({}, { baseUrl: BASE, dataDir: dir, distDir: dir, root: ROOT, ownerEmail: "owner@wall.test", signup: "open" });
  const db = openDb(":memory:");
  const app2 = createApp({ config: open, db, storage: diskStorage(path.join(dir, "assets2")), mail: { kind: "log", async send(m) { links.push(m.link); } }, shell: async () => SHELL });
  const ask = await app2.request(`${BASE}/api/auth/link`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: "second@wall.test" }) });
  assert.equal(ask.status, 200);
  const back = await app2.request(links.pop());
  const other = /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie"))?.[1];
  assert.ok(other);
  // a different instance cannot know this deck; the same instance with another session must not either
  const strangerOnOurs = await call(`/api/decks/${deckId}`, { cookie: "not-a-session" });
  assert.equal(strangerOnOurs.status, 401);
  const list = await json(await app2.request(`${BASE}/api/decks`, { headers: { cookie: `storyboard_session=${other}` } }));
  assert.deepEqual(list.decks, []);
});

test("a token lets a tool in without a browser, and pushes a whole draft", async () => {
  const made = await json(await call("/api/auth/token", { method: "POST", cookie: owner, body: {} }));
  assert.ok(made.token);
  const mine = await json(await call("/api/decks", { bearer: made.token }));
  assert.equal(mine.decks.length, 1);
  const pushed = await json(await call(`/api/decks/${deckId}/draft`, { method: "PUT", bearer: made.token, body: { deck: { title: "Pushed", slides: [{ title: "from a checkout" }] } } }));
  assert.equal(pushed.status, 200, pushed.error);
  assert.equal(pushed.slides, 1);
  const now = await json(await call(`/api/decks/${deckId}`, { cookie: owner }));
  assert.equal(now.title, "Pushed");
  rev = now.rev;
});

test("a deck from an example brings its pictures with it, as its own", async () => {
  const made = await json(await call("/api/decks", { method: "POST", cookie: owner, body: { title: "Tour", from: "hello-wall" } }));
  assert.equal(made.status, 201, made.error);
  const got = await json(await call(`/api/decks/${made.id}`, { cookie: owner }));
  const images = JSON.stringify(got.deck).match(/"image":"([^"]+)"/g) ?? [];
  assert.ok(images.length > 0, "hello-wall has pictures");
  for (const im of images) assert.match(im, /"image":"[0-9a-f]{20}\.webp"/, im);
  const nonsense = await call("/api/decks", { method: "POST", cookie: owner, body: { title: "X", from: "../../etc" } });
  assert.equal(nonsense.status, 400);
  await call(`/api/decks/${made.id}`, { method: "DELETE", cookie: owner });
});

test("deleting a deck takes its pictures with it", async () => {
  const file = path.join(dir, "assets", deckId, picture);
  await stat(file);
  const gone = await json(await call(`/api/decks/${deckId}`, { method: "DELETE", cookie: owner }));
  assert.equal(gone.status, 200);
  assert.equal((await call("/d/bakery")).status, 404);
  await assert.rejects(stat(file));
  const list = await json(await call("/api/decks", { cookie: owner }));
  assert.deepEqual(list.decks, []);
});

test("the pages: a form signs in, makes a deck, and signs out", async () => {
  const asked = await call("/api/auth/link", { method: "POST", form: { email: "owner@wall.test", next: "/edit/nowhere" } });
  assert.equal(asked.status, 200);
  assert.match(await asked.text(), /printed in the server/);
  const link = links.pop();
  assert.match(link, /next=%2Fedit%2Fnowhere/);
  const back = await app.request(link);
  assert.equal(back.headers.get("location"), "/edit/nowhere");
  const cookie = /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie"))?.[1];
  const made = await call("/api/decks", { method: "POST", cookie, form: { title: "By form", from: "blank" } });
  assert.equal(made.status, 302);
  assert.equal(made.headers.get("location"), "/edit/by-form");
  const out = await call("/api/auth/signout", { method: "POST", cookie, form: {} });
  assert.equal(out.status, 302);
  assert.equal((await call("/edit/by-form", { cookie })).status, 302, "the session is gone");
});
