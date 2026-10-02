/* Tokens a person has out: seen by their first characters, noted when
   they are used, and taken back one at a time without disturbing the
   rest. A revoked one is not a weaker token — it is no token at all. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { diskStorage } from "./storage.js";
import { readConfig, ROOT } from "./config.js";

const BASE = "http://wall.test";

let app, dir, links, cookie;

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "storyboard-tokens-"));
  links = [];
  app = createApp({
    config: readConfig(
      {},
      { baseUrl: BASE, dataDir: dir, distDir: dir, root: ROOT, ownerEmail: "owner@wall.test", signup: "open" },
    ),
    db: openDb(":memory:"),
    storage: diskStorage(path.join(dir, "assets")),
    mail: { kind: "log", async send(m) { links.push(m.link); } },
    shell: async () => "<!doctype html><html><head></head><body></body></html>",
  });
  /* Once: asking for a link is rate-limited to five an hour per
     address, which is the point of it, and seven tests is more. */
  cookie = await signIn("owner@wall.test");
});
after(() => rm(dir, { recursive: true, force: true }));

const post = (route, { cookie, bearer, form } = {}) =>
  app.request(`${BASE}${route}`, {
    method: "POST",
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : { origin: BASE }),
      ...(cookie ? { cookie: `storyboard_session=${cookie}` } : {}),
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
  });

async function signIn(email) {
  await app.request(`${BASE}/api/auth/link`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const back = await app.request(links.pop());
  return /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie") || "")?.[1];
}
const makeToken = async (cookie) => (await post("/api/auth/token", { cookie }).then((r) => r.json())).token;

/** Whether a token still opens anything. */
const works = async (token) =>
  (await app.request(`${BASE}/api/decks`, { headers: { authorization: `Bearer ${token}` } })).status === 200;

test("a token works until it is revoked, and then does not", async () => {
  const token = await makeToken(cookie);
  assert.equal(await works(token), true);

  const listed = await app.request(`${BASE}/developers`, { headers: { cookie: `storyboard_session=${cookie}` } });
  const page = await listed.text();
  assert.match(page, new RegExp(token.slice(0, 8).replace(/[-]/g, "\\$&")), "its first characters are shown");
  assert.equal(page.includes(token), false, "and never the whole of it");

  const gone = await post(`/api/auth/token/${token.slice(0, 8)}/delete`, { cookie });
  assert.equal(gone.status, 200);
  assert.equal(await works(token), false, "revoked is revoked");
});

test("revoking one leaves the others alone", async () => {
  const [a, b, c] = [await makeToken(cookie), await makeToken(cookie), await makeToken(cookie)];

  await post(`/api/auth/token/${b.slice(0, 8)}/delete`, { cookie });
  assert.deepEqual([await works(a), await works(b), await works(c)], [true, false, true]);
});

test("a token cannot be taken back by somebody else", async () => {
  const token = await makeToken(cookie);
  const theirs = await signIn("stranger@wall.test");

  const tried = await post(`/api/auth/token/${token.slice(0, 8)}/delete`, { cookie: theirs });
  assert.equal(tried.status, 404);
  assert.equal(await works(token), true, "and it still works");

  // nor by nobody at all
  assert.equal((await post(`/api/auth/token/${token.slice(0, 8)}/delete`)).status, 401);
  assert.equal(await works(token), true);

  // and a stranger is not shown it
  const page = await (await app.request(`${BASE}/developers`, { headers: { cookie: `storyboard_session=${theirs}` } })).text();
  assert.equal(page.includes(token.slice(0, 8)), false);
});

test("a prefix is matched whole, not read as a pattern", async () => {
  const token = await makeToken(cookie);

  /* base64url contains `_`, which LIKE reads as "any character" — so a
     prefix of underscores would sweep every token away if this matched
     with LIKE rather than substr. */
  for (const bad of ["________", "%%%%%%%%", "abc", "", "a".repeat(40), "../../etc"]) {
    const tried = await post(`/api/auth/token/${encodeURIComponent(bad)}/delete`, { cookie });
    assert.ok(tried.status === 404 || tried.status === 405, `${JSON.stringify(bad)} → ${tried.status}`);
  }
  assert.equal(await works(token), true, "nothing was swept away");
});

test("a used token says when it was last used", async () => {
  const token = await makeToken(cookie);

  const before = await (await app.request(`${BASE}/developers`, { headers: { cookie: `storyboard_session=${cookie}` } })).text();
  const row = (page) => page.slice(page.indexOf(token.slice(0, 8)), page.indexOf(token.slice(0, 8)) + 400);
  assert.match(row(before), /never/, "unused until it is used");

  assert.equal(await works(token), true);
  const after = await (await app.request(`${BASE}/developers`, { headers: { cookie: `storyboard_session=${cookie}` } })).text();
  assert.doesNotMatch(row(after), /never/);
  assert.match(row(after), /just now|min ago/);
});

test("a revoked token is turned away by the assistant's door too", async () => {
  const token = await makeToken(cookie);

  const mcp = (t) =>
    app.request(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
  assert.equal((await mcp(token)).status, 200);

  await post(`/api/auth/token/${token.slice(0, 8)}/delete`, { cookie });
  assert.equal((await mcp(token)).status, 401, "the assistant is signed out of the wall");
});

test("the button on the page is a form that works", async () => {
  const token = await makeToken(cookie);

  // what the browser sends when Revoke is pressed
  const pressed = await post(`/api/auth/token/${token.slice(0, 8)}/delete`, { cookie, form: true });
  assert.equal(pressed.status, 302);
  assert.equal(pressed.headers.get("location"), "/developers");
  assert.equal(await works(token), false);
});
