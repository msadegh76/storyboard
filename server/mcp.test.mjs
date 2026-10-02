/* Somebody else's AI, driving the wall: a token, a handshake, the
   tools it is offered, and then a whole deck made, written into,
   walked and published without touching any other door. */

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
const SHELL = `<!doctype html><html><head><title>Storyboard</title></head><body></body></html>`;

let app, dir, links, token;

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "storyboard-mcp-"));
  links = [];
  app = createApp({
    config: readConfig(
      {},
      { baseUrl: BASE, dataDir: dir, distDir: dir, root: ROOT, ownerEmail: "owner@wall.test", signup: "closed" },
    ),
    db: openDb(":memory:"),
    storage: diskStorage(path.join(dir, "assets")),
    mail: { kind: "log", async send(m) { links.push(m.link); } },
    shell: async () => SHELL,
  });

  // a token, the way /developers makes one
  const asked = await app.request(`${BASE}/api/auth/link`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@wall.test" }),
  });
  assert.equal(asked.status, 200);
  const back = await app.request(links.pop());
  const cookie = /storyboard_session=([^;]+)/.exec(back.headers.get("set-cookie") || "")?.[1];
  const made = await app.request(`${BASE}/api/auth/token`, {
    method: "POST",
    headers: { origin: BASE, cookie: `storyboard_session=${cookie}` },
  });
  ({ token } = await made.json());
  assert.ok(token, "a bearer token");
});
after(() => rm(dir, { recursive: true, force: true }));

let next = 0;
/** One JSON-RPC call, as the holder of the token unless told otherwise. */
async function rpc(method, params, { bearer = token, notice = false } = {}) {
  const res = await app.request(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", ...(notice ? {} : { id: ++next }), method, params }),
  });
  return { status: res.status, ...(res.status === 202 ? {} : await res.json()) };
}

/** A tool call, unwrapped to what the assistant would read. */
async function tool(name, args = {}) {
  const out = await rpc("tools/call", { name, arguments: args });
  assert.equal(out.status, 200, JSON.stringify(out));
  const said = out.result.content[0].text;
  return { said, failed: !!out.result.isError, got: tryJson(said) };
}
const tryJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

test("a cookie is not a token, and neither is nothing", async () => {
  const none = await rpc("initialize", {}, { bearer: null });
  assert.equal(none.status, 401);
  assert.match(none.error, /token/);
});

test("the handshake says what it speaks and what it is for", async () => {
  const out = await rpc("initialize", { protocolVersion: "2025-06-18" });
  assert.equal(out.status, 200);
  assert.equal(out.result.protocolVersion, "2025-06-18");
  assert.equal(out.result.serverInfo.name, "storyboard");
  assert.ok(out.result.capabilities.tools);
  assert.match(out.result.instructions, /publish/);

  // an unknown version is answered with one this does speak
  const odd = await rpc("initialize", { protocolVersion: "1999-01-01" });
  assert.ok(["2025-06-18", "2025-03-26", "2024-11-05"].includes(odd.result.protocolVersion));

  // and the client saying it is ready is not a question, however it is sent
  assert.equal((await rpc("notifications/initialized", {}, { notice: true })).status, 202);
  assert.equal((await rpc("notifications/initialized", {})).status, 202);
});

test("every tool is offered with a schema, and nonsense is refused as nonsense", async () => {
  const { result } = await rpc("tools/list");
  const names = result.tools.map((t) => t.name);
  for (const want of ["list_decks", "create_deck", "add_slide", "publish", "deck_schema"])
    assert.ok(names.includes(want), `${want} is offered`);
  for (const t of result.tools) {
    assert.ok(t.description.length > 20, `${t.name} says what it is for`);
    assert.equal(t.inputSchema.type, "object");
  }
  const add = result.tools.find((t) => t.name === "add_slide");
  assert.deepEqual(add.inputSchema.required, ["deck", "slide"]);

  const nope = await rpc("tools/call", { name: "set_fire_to_it", arguments: {} });
  assert.equal(nope.error.code, -32602);
  const huh = await rpc("resources/list", {});
  assert.equal(huh.error.code, -32601);
});

test("the schema names the fields the validator actually keeps", async () => {
  const { said } = await tool("deck_schema");
  for (const field of ["title", "bullets", "table", "say", "mural"]) assert.match(said, new RegExp(field));
  assert.match(said, /plaster/); // a room, read from rooms.ts
  assert.match(said, /cannot be fetched/); // and the truth about pictures
});

test("a deck, made and written and published, without leaving the protocol", async () => {
  const made = await tool("create_deck", { title: "Quarter in Review" });
  assert.equal(made.failed, false, made.said);
  assert.equal(made.got.slug, "quarter-in-review");

  // named by its slug from here on, the way an assistant would
  const deck = "quarter-in-review";

  // the three shapes a card comes in, each landing at the end in turn
  const one = await tool("add_slide", { deck, slide: { mural: "Quarter in Review", sub: "the numbers" } });
  assert.equal(one.failed, false, one.said);
  assert.equal(one.got.slides, 1);
  await tool("add_slide", { deck, slide: "A whole slide, written as a sentence." });
  const three = await tool("add_slide", {
    deck,
    slide: { title: "Three things", bullets: ["one", "two", "three"], say: "read these out" },
  });
  assert.equal(three.got.slides, 3, "each one went to the end without being told where");

  // and one put in front of the rest
  await tool("add_slide", { deck, slide: { title: "Before all that" }, after: 0 });
  const read = await tool("read_deck", { deck });
  assert.equal(read.got.deck.slides.length, 4);
  assert.equal(read.got.deck.slides[0].title, "Before all that");
  assert.equal(read.got.deck.slides[1].mural, "Quarter in Review");
  assert.equal(read.got.deck.slides[2], "A whole slide, written as a sentence.");

  // moved, rewritten, taken out
  await tool("move_slide", { deck, from: 1, to: 4 });
  await tool("write_slide", { deck, n: 1, slide: { title: "Quarter in Review", text: "painted over" } });
  const gone = await tool("remove_slide", { deck, n: 4 });
  assert.equal(gone.failed, false, gone.said);
  assert.equal(gone.got.slides, 3);

  // the deck's own settings
  await tool("set_fields", { deck, set: { room: "night", overview: "start" } });
  const dark = await tool("read_deck", { deck });
  assert.equal(dark.got.deck.room, "night");

  // nothing is at the link until it is put there
  assert.equal(dark.got.published, null);
  const out = await tool("publish", { deck });
  assert.equal(out.failed, false, out.said);
  assert.equal(out.got.url, `${BASE}/d/quarter-in-review`);
  const seen = await app.request(`${BASE}/d/quarter-in-review`);
  assert.equal(seen.status, 200);
  assert.match(await seen.text(), /Quarter in Review/);
});

test("the whole draft, the settings, and going back to an older one", async () => {
  const deck = "quarter-in-review";

  // a deck laid out in one go, over the top of what is there
  const whole = await tool("replace_draft", {
    deck,
    document: { title: "Quarter in Review", slides: [{ mural: "Start again" }, { title: "Only this" }] },
  });
  assert.equal(whole.failed, false, whole.said);
  assert.equal(whole.got.slides, 2);

  // every visibility the server takes is one the tool offers
  const { result } = await rpc("tools/list");
  const offered = result.tools.find((t) => t.name === "deck_settings").inputSchema.properties.visibility.enum;
  for (const v of offered) {
    const set = await tool("deck_settings", { deck, visibility: v });
    assert.equal(set.failed, false, `${v}: ${set.said}`);
    assert.equal(set.got.visibility, v);
  }
  await tool("deck_settings", { deck, visibility: "public" });

  // the draft thrown away goes back to what was published, not to nothing
  const back = await tool("discard", { deck });
  assert.equal(back.failed, false, back.said);
  assert.equal((await tool("read_deck", { deck })).got.deck.slides.length, 3, "the published four-minus-one");

  // and a published version can be fetched back into the draft
  const versions = await tool("list_versions", { deck });
  assert.ok(versions.got.versions.length >= 1);
  const put = await tool("restore_version", { deck, rev: versions.got.versions[0].rev });
  assert.equal(put.failed, false, put.said);
});

test("a deck deleted is a deck gone", async () => {
  const made = await tool("create_deck", { title: "Briefly" });
  assert.equal(made.failed, false, made.said);
  const gone = await tool("delete_deck", { deck: "briefly" });
  assert.equal(gone.failed, false, gone.said);
  const left = await tool("list_decks");
  assert.equal(left.got.decks.some((d) => d.slug === "briefly"), false);
});

test("what the assistant gets wrong comes back as words it can act on", async () => {
  const lost = await tool("add_slide", { deck: "no-such-wall", slide: "hello" });
  assert.equal(lost.failed, true);
  assert.match(lost.said, /no deck of yours called "no-such-wall"/);
  assert.match(lost.said, /quarter-in-review/, "and it is told what there is instead");

  const empty = await tool("add_slide", { deck: "quarter-in-review", slide: { foot: "only a footnote" } });
  assert.equal(empty.failed, true);
  assert.match(empty.said, /needs a title, some text, or a picture/);

  // a field that is not one is dropped, and the drop is reported
  const odd = await tool("add_slide", {
    deck: "quarter-in-review",
    slide: { title: "Fine", colour: "puce", paper: "kryptonite" },
  });
  assert.equal(odd.failed, false, odd.said);
  assert.match(odd.got.complaints.join(" "), /no such field "colour"/);
  assert.match(odd.got.complaints.join(" "), /bad value for paper/);

  // and a stale revision is a refusal, not a silent overwrite
  const stale = await tool("write_slide", { deck: "quarter-in-review", n: 1, slide: "late", rev: 1 });
  assert.equal(stale.failed, true);
  assert.match(stale.said, /changed in another window/);
});

test("one author's decks are not another's", async () => {
  const other = await app.request(`${BASE}/api/auth/link`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: JSON.stringify({ email: "someone@wall.test" }),
  });
  assert.equal(other.status, 403, "and a closed wall does not let them in at all");

  const mine = await tool("list_decks");
  assert.equal(mine.got.decks.length, 1);
});

test("the prompt hands the words to the assistant, not to a parser", async () => {
  const { result } = await rpc("prompts/list");
  assert.equal(result.prompts[0].name, "slide");

  const got = await rpc("prompts/get", { name: "slide", arguments: { text: "title: Hello bullets: - a - b" } });
  const said = got.result.messages[0].content.text;
  assert.match(said, /add_slide/);
  assert.match(said, /title: Hello bullets: - a - b/);

  const bare = await rpc("prompts/get", { name: "slide", arguments: {} });
  assert.match(bare.result.messages[0].content.text, /what I say next/);
});

test("a batch and a body that is not JSON are turned away before anything is done", async () => {
  const each = async (body) => {
    const res = await app.request(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body,
    });
    return { status: res.status, ...(await res.json()) };
  };
  assert.equal((await each("[]")).status, 400);
  assert.equal((await each("not json")).error.code, -32700);
  assert.equal((await app.request(`${BASE}/api/mcp`, { headers: { authorization: `Bearer ${token}` } })).status, 405);
});
