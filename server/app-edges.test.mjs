/* The server at its edges: what it refuses, what it limits, and what
   it does when asked for something that is not there. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { diskStorage } from "./storage.js";
import { readConfig, ROOT } from "./config.js";

const BASE = "https://wall.test";
const SHELL = `<!doctype html><html><head><title>Storyboard</title></head><body><script type="module" src="./assets/app.js"></script></body></html>`;

let dir, db, links, app, config;

/** A server of our own, with a database in memory and the pictures in a temp dir. */
function build(over = {}) {
  links = [];
  db = openDb(":memory:");
  config = readConfig({}, {
    baseUrl: BASE,
    dataDir: dir,
    distDir: path.join(dir, "dist"),
    root: ROOT,
    ownerEmail: "owner@wall.test",
    signup: "closed",
    ...over,
  });
  return createApp({
    config,
    db,
    storage: diskStorage(path.join(dir, "assets")),
    mail: { kind: "log", async send(m) { links.push(m.link); } },
    shell: async () => SHELL,
  });
}

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "storyboard-edges-"));
  await mkdir(path.join(dir, "dist", "assets"), { recursive: true });
  await writeFile(path.join(dir, "dist", "index.html"), SHELL);
  await writeFile(path.join(dir, "dist", "assets", "app.js"), "console.log(1)");
  await writeFile(path.join(dir, "dist", "present.html"), "<p>presenter</p>");
  await writeFile(path.join(dir, "secret.txt"), "not for you");
  app = build();
});
after(() => rm(dir, { recursive: true, force: true }));

const call = (route, { method = "GET", body, cookie, bearer, form, raw, headers: extra = {} } = {}) => {
  const headers = { origin: BASE, ...extra };
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

async function signIn(email = "owner@wall.test") {
  const asked = await call("/api/auth/link", { method: "POST", body: { email } });
  assert.equal(asked.status, 200, await asked.text());
  const back = await app.request(links.pop());
  const cookie = /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie") || "")?.[1];
  assert.ok(cookie);
  return { cookie, setCookie: back.headers.get("set-cookie") };
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

let owner;

test("cookies are Secure on an https address, and a link may be used for a while, not forever", async () => {
  const { cookie, setCookie } = await signIn();
  owner = cookie;
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//);

  // a link older than its fifteen minutes
  db.prepare("INSERT INTO magic_links (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    sha("old-token"), "owner@wall.test", new Date(Date.now() - 60_000).toISOString(), new Date().toISOString(),
  );
  const late = await call("/api/auth/callback?token=old-token");
  assert.equal(late.status, 400);
  assert.match(await late.text(), /expired/);
  const junk = await call("/api/auth/callback?token=never-issued");
  assert.equal(junk.status, 400);
  assert.match(await junk.text(), /not one of ours/);
  const none = await call("/api/auth/callback");
  assert.equal(none.status, 400);
});

test("an address may ask for five links an hour", async () => {
  const fresh = build();
  const ask = () => fresh.request(`${BASE}/api/auth/link`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: "owner@wall.test" }) });
  for (let i = 0; i < 5; i++) assert.equal((await ask()).status, 200, `ask ${i + 1}`);
  const sixth = await ask();
  assert.equal(sixth.status, 429);
  app = build(); // back to a clean one, and sign the owner in again
  owner = (await signIn()).cookie;
});

test("a session that has run out is nobody; signing out ends one early", async () => {
  db.prepare("INSERT INTO sessions (id, user_id, kind, expires_at, created_at) SELECT 'stale-session', id, 'browser', ?, ? FROM users WHERE email = 'owner@wall.test'").run(
    new Date(Date.now() - 1000).toISOString(), new Date().toISOString(),
  );
  assert.equal((await call("/api/decks", { cookie: "stale-session" })).status, 401);
  const { cookie } = await signIn();
  assert.equal((await call("/api/decks", { cookie })).status, 200);
  const out = await call("/api/auth/signout", { method: "POST", cookie, body: {} });
  assert.equal(out.status, 200);
  assert.match(out.headers.get("set-cookie") || "", /storyboard_session=;|Max-Age=0/);
  assert.equal((await call("/api/decks", { cookie })).status, 401);
  assert.equal((await call("/api/decks")).status, 401, "nobody at all");
});

test("a body that is too big, or not JSON, is refused before it is read", async () => {
  const huge = await json(await call("/api/decks", { method: "POST", cookie: owner, raw: JSON.stringify({ title: "x".repeat(600_000) }), headers: { "content-type": "application/json" } }));
  assert.equal(huge.status, 413);
  assert.match(huge.error, /too much to take/);
  const hugeLink = await call("/api/auth/link", { method: "POST", raw: JSON.stringify({ email: "x".repeat(5000) }), headers: { "content-type": "application/json" } });
  assert.equal(hugeLink.status, 413);
  const junk = await call("/api/decks", { method: "POST", cookie: owner, raw: "{not json", headers: { "content-type": "application/json" } });
  assert.equal(junk.status, 400);
  const empty = await call("/api/decks", { method: "POST", cookie: owner, raw: "", headers: { "content-type": "application/json" } });
  assert.equal(empty.status, 400);
});

test("the built wall's files are served from dist and nowhere else", async () => {
  const js = await call("/assets/app.js");
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.match(js.headers.get("cache-control"), /immutable/);
  assert.equal(await js.text(), "console.log(1)");
  assert.equal((await call("/present")).status, 200);
  assert.equal((await call("/present.html")).status, 200);
  assert.equal((await call("/assets/../secret.txt")).status, 404);
  assert.equal((await call("/assets/%2e%2e/secret.txt")).status, 404);
  assert.equal((await call("/assets/%2e%2e/%2e%2e/secret.txt")).status, 404);
  assert.equal((await call("/assets/nope.js")).status, 404);
  assert.equal((await call("/assets/")).status, 404);
  assert.equal((await call("/demo/nope.png")).status, 404);
});

let deckId, rev, slug;

test("titles become addresses: accents folded, the second of a name numbered, the reserved renamed", async () => {
  const a = await json(await call("/api/decks", { method: "POST", cookie: owner, body: { title: "Café au lait ☕" } }));
  assert.equal(a.status, 201, a.error);
  assert.equal(a.slug, "cafe-au-lait");
  const b = await json(await call("/api/decks", { method: "POST", cookie: owner, body: { title: "Café au lait" } }));
  assert.equal(b.slug, "cafe-au-lait-2");
  const c = await json(await call("/api/decks", { method: "POST", cookie: owner, body: { title: "API" } }));
  assert.equal(c.slug, "api-wall");
  const d = await json(await call("/api/decks", { method: "POST", cookie: owner, body: { title: "!!" } }));
  assert.equal(d.slug, "wall");
  const none = await call("/api/decks", { method: "POST", cookie: owner, body: { title: "   " } });
  assert.equal(none.status, 400);
  deckId = a.id;
  rev = a.rev;
  slug = a.slug;
  for (const id of [b.id, c.id, d.id]) await call(`/api/decks/${id}`, { method: "DELETE", cookie: owner });
});

test("what a slide operation may not do", async () => {
  const add = await json(await call(`/api/decks/${deckId}/slides`, { method: "POST", cookie: owner, body: { after: 0, slide: { title: "One" }, rev } }));
  rev = add.rev;
  const tooFar = await call(`/api/decks/${deckId}/slides`, { method: "POST", cookie: owner, body: { after: 5, slide: { title: "x" }, rev } });
  assert.equal(tooFar.status, 400);
  const noSlide = await call(`/api/decks/${deckId}/slides`, { method: "POST", cookie: owner, body: { after: 0, rev } });
  assert.equal(noSlide.status, 400);
  const notWhole = await call(`/api/decks/${deckId}/slides`, { method: "POST", cookie: owner, body: { after: "one", slide: { title: "x" }, rev } });
  assert.equal(notWhole.status, 400);
  assert.equal((await call(`/api/decks/${deckId}/slides/9`, { method: "DELETE", cookie: owner, body: { rev } })).status, 400);
  assert.equal((await call(`/api/decks/${deckId}/slides/1/move`, { method: "POST", cookie: owner, body: { to: 0, rev } })).status, 400);
  assert.equal((await call(`/api/decks/${deckId}/slides/x`, { method: "PUT", cookie: owner, body: { slide: { title: "x" }, rev } })).status, 400);
  const badRev = await call(`/api/decks/${deckId}/slides/1`, { method: "PUT", cookie: owner, body: { slide: { title: "x" }, rev: "later" } });
  assert.equal(badRev.status, 400);
  const badDraft = await call(`/api/decks/${deckId}/draft`, { method: "PUT", cookie: owner, body: { deck: { slides: "x" }, rev } });
  assert.equal(badDraft.status, 400);
  const noDraft = await call(`/api/decks/${deckId}/draft`, { method: "PUT", cookie: owner, body: { rev } });
  assert.equal(noDraft.status, 400);
  const tooBig = await json(await call(`/api/decks/${deckId}/draft`, { method: "PUT", cookie: owner, body: { deck: { title: "T", slides: [{ title: "x", text: "y".repeat(300_000) }] }, rev } }));
  assert.equal(tooBig.status, 400, "a deck over its size is refused as a deck");
  assert.match(tooBig.error, /over 256 KB/);
  const nothingToDiscard = await call(`/api/decks/${deckId}/discard`, { method: "POST", cookie: owner, body: {} });
  assert.equal(nothingToDiscard.status, 400);
  const versions = await json(await call(`/api/decks/${deckId}/versions`, { cookie: owner }));
  assert.deepEqual(versions.versions, []);
  // the deck is unchanged by all of it
  const now = await json(await call(`/api/decks/${deckId}`, { cookie: owner }));
  assert.equal(now.rev, rev);
  assert.equal(now.deck.slides.length, 1);
});

test("the deck's own fields: a title written from the panel reaches the list", async () => {
  const out = await json(await call(`/api/decks/${deckId}/fields`, { method: "PATCH", cookie: owner, body: { set: { title: "Renamed from the wall", subtitle: "a line", seed: "s" }, rev } }));
  assert.equal(out.status, 200, out.error);
  rev = out.rev;
  const list = await json(await call("/api/decks", { cookie: owner }));
  assert.equal(list.decks[0].title, "Renamed from the wall");
  const bad = await call(`/api/decks/${deckId}/fields`, { method: "PATCH", cookie: owner, body: { set: { room: 7 }, rev } });
  assert.equal(bad.status, 400);
  const dropped = await json(await call(`/api/decks/${deckId}/fields`, { method: "PATCH", cookie: owner, body: { set: { room: "attic" }, rev } }));
  assert.equal(dropped.status, 200, "an unknown room is dropped with a complaint, as the wall would");
  assert.equal(dropped.complaints.length, 1);
  rev = dropped.rev;
});

test("an owner who has not published sees why, and the JSON is not there either", async () => {
  const page = await call(`/d/${slug}`, { cookie: owner });
  assert.equal(page.status, 404);
  assert.match(await page.text(), /Not published yet/);
  assert.equal((await call(`/d/${slug}/deck.json`, { cookie: owner })).status, 404);
  assert.equal((await call(`/d/${slug}`)).status, 404);
  const head = await call(`/d/${slug}`, { method: "HEAD" });
  assert.equal(head.status, 404);
});

test("the published JSON revalidates by ETag and follows visibility", async () => {
  await call(`/api/decks/${deckId}/publish`, { method: "POST", cookie: owner, body: { rev } });
  const data = await call(`/d/${slug}/deck.json`);
  assert.equal(data.status, 200);
  const etag = data.headers.get("etag");
  assert.ok(etag);
  const head = await call(`/d/${slug}`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { visibility: "private" } });
  assert.equal((await call(`/d/${slug}/deck.json`)).status, 404);
  assert.equal((await call(`/d/${slug}/deck.json`, { cookie: owner })).status, 200);
  await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { visibility: "public" } });
  const bad = await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { visibility: "secret" } });
  assert.equal(bad.status, 400);
  const noTitle = await call(`/api/decks/${deckId}`, { method: "PATCH", cookie: owner, body: { title: " " } });
  assert.equal(noTitle.status, 400);
});

test("quotas: decks a person may have, pictures a deck may hold", async () => {
  const tight = build({ quota: { ...config.quota, decksPerUser: 1, picturesPerDeck: 1 } });
  const ask = await tight.request(`${BASE}/api/auth/link`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: "owner@wall.test" }) });
  assert.equal(ask.status, 200);
  const back = await tight.request(links.pop());
  const cookie = /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie"))?.[1];
  const mk = (title) => tight.request(`${BASE}/api/decks`, { method: "POST", headers: { origin: BASE, cookie: `storyboard_session=${cookie}`, "content-type": "application/json" }, body: JSON.stringify({ title }) });
  const one = await mk("One");
  assert.equal(one.status, 201);
  const two = await mk("Two");
  assert.equal(two.status, 403);
  const { id } = await one.json();
  const upload = async (w) => {
    const form = new FormData();
    form.append("file", new Blob([await sharp({ create: { width: w, height: 10, channels: 3, background: "#fff" } }).png().toBuffer()]), "p.png");
    return tight.request(`${BASE}/api/decks/${id}/assets`, { method: "POST", headers: { origin: BASE, cookie: `storyboard_session=${cookie}` }, body: form });
  };
  assert.equal((await upload(10)).status, 200);
  assert.equal((await upload(20)).status, 403);
  const noFile = await tight.request(`${BASE}/api/decks/${id}/assets`, { method: "POST", headers: { origin: BASE, cookie: `storyboard_session=${cookie}` }, body: new FormData() });
  assert.equal(noFile.status, 400);
  app = build();
  owner = (await signIn()).cookie;
});

test("forms: a deck deleted from the home page, a token shown once, a next that stays home", async () => {
  const made = await json(await call("/api/decks", { method: "POST", cookie: owner, body: { title: "Doomed" } }));
  const gone = await call(`/api/decks/${made.id}/delete`, { method: "POST", cookie: owner, form: {} });
  assert.equal(gone.status, 302);
  assert.equal(gone.headers.get("location"), "/");
  assert.equal((await call(`/api/decks/${made.id}`, { cookie: owner })).status, 404);

  const page = await call("/api/auth/token", { method: "POST", cookie: owner, form: {} });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Your token/);
  const token = /class="token">([^<]+)</.exec(html)?.[1];
  assert.ok(token);
  assert.equal((await call("/api/decks", { bearer: token })).status, 200);
  assert.equal((await call("/api/auth/token", { method: "POST", body: {} })).status, 401);

  const asked = await call("/api/auth/link", { method: "POST", body: { email: "owner@wall.test", next: "//evil.test/phish" } });
  assert.equal(asked.status, 200);
  const link = links.pop();
  assert.doesNotMatch(link, /evil/);
  const back = await app.request(link);
  assert.equal(back.headers.get("location"), "/");
  const asked2 = await call("/api/auth/link", { method: "POST", body: { email: "owner@wall.test", next: "https://evil.test/" } });
  assert.doesNotMatch(links.pop(), /evil/);
  assert.equal(asked2.status, 200);
});

test("the sign-in page itself, and where a signed-in person is sent", async () => {
  const page = await call("/signin");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Send me a link/);
  const already = await call("/signin", { cookie: owner });
  assert.equal(already.status, 302);
  assert.equal(already.headers.get("location"), "/");
  const home = await call("/home", { cookie: owner });
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Product demo/);
  assert.doesNotMatch(homeHtml, /Make a token/, "the developers' corner is off the home page");

  // a visitor's first screen is a wall with the product's words over it
  const front = await call("/");
  assert.equal(front.status, 200);
  const frontHtml = await front.text();
  assert.match(frontHtml, /id="landing"/);
  assert.match(frontHtml, /Make your own/);
  assert.match(frontHtml, /"landing":true/);
  assert.match(frontHtml, /"editable":false/);
  assert.match(frontHtml, /Lighthouse Bakery/);
  const welcome = await call("/welcome", { cookie: owner });
  assert.equal(welcome.status, 200);
  assert.match(await welcome.text(), /Your decks/, "signed in, the front door points home");
  const signedInRoot = await call("/", { cookie: owner });
  assert.match(await signedInRoot.text(), /<h1>Your decks<\/h1>/);

  const devs = await call("/developers", { cookie: owner });
  assert.equal(devs.status, 200);
  assert.match(await devs.text(), /Make a token/);
  assert.equal((await call("/developers")).status, 302);
  const nowhere = await call("/nothing/here");
  assert.equal(nowhere.status, 404);
  assert.match(await nowhere.text(), /Not here/);
  const apiNowhere = await call("/api/nothing");
  assert.equal(apiNowhere.status, 404);
  assert.match(apiNowhere.headers.get("content-type"), /json/);
});

test("someone else's deck is not there, even by id, even with a token", async () => {
  const other = build({ signup: "open" });
  // the same database is not shared, so make a deck on this instance first
  const askA = await other.request(`${BASE}/api/auth/link`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: "a@wall.test" }) });
  assert.equal(askA.status, 200);
  const a = /storyboard_session=([^;]+)/.exec((await other.request(links.pop())).headers.get("set-cookie"))?.[1];
  const askB = await other.request(`${BASE}/api/auth/link`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: "b@wall.test" }) });
  assert.equal(askB.status, 200);
  const b = /storyboard_session=([^;]+)/.exec((await other.request(links.pop())).headers.get("set-cookie"))?.[1];
  const made = await (await other.request(`${BASE}/api/decks`, { method: "POST", headers: { origin: BASE, cookie: `storyboard_session=${a}`, "content-type": "application/json" }, body: JSON.stringify({ title: "Mine" }) })).json();
  const asB = (route, init = {}) => other.request(`${BASE}${route}`, { ...init, headers: { origin: BASE, cookie: `storyboard_session=${b}`, "content-type": "application/json", ...(init.headers || {}) } });
  assert.equal((await asB(`/api/decks/${made.id}`)).status, 404);
  assert.equal((await asB(`/api/decks/${made.id}/slides`, { method: "POST", body: JSON.stringify({ after: 0, slide: { title: "x" } }) })).status, 404);
  assert.equal((await asB(`/api/decks/${made.id}/publish`, { method: "POST", body: "{}" })).status, 404);
  assert.equal((await asB(`/api/decks/${made.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await asB(`/edit/${made.slug}`)).status, 404);
  const tokenB = (await (await asB("/api/auth/token", { method: "POST", body: "{}" })).json()).token;
  assert.equal((await other.request(`${BASE}/api/decks/${made.id}`, { headers: { authorization: `Bearer ${tokenB}` } })).status, 404);
  // and the owner still has it
  assert.equal((await other.request(`${BASE}/api/decks/${made.id}`, { headers: { cookie: `storyboard_session=${a}` } })).status, 200);
});
