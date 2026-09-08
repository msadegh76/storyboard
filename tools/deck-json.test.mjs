/* A deck module read as data: the pointer followed, code refused. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readDeckModule, resolveDeckFile } from "./deck-json.mjs";
import { ROOT } from "../server/config.js";

test("the root deck.config.js is a pointer, and it is followed", async () => {
  const real = await resolveDeckFile(path.join(ROOT, "deck.config.js"));
  assert.match(real, /examples\/onboarding\/deck\.config\.js$/);
  const deck = await readDeckModule(path.join(ROOT, "deck.config.js"));
  assert.equal(deck.title, "Getting started");
  assert.ok(deck.slides.length > 20);
});

test("the examples read as the objects they are", async () => {
  const deck = await readDeckModule(path.join(ROOT, "examples", "hello-wall", "deck.config.js"));
  assert.ok(Array.isArray(deck.slides) && deck.slides.length > 0);
  assert.ok(deck.slides.some((s) => s.mural || s.notes?.some((c) => c.mural)), "a heading somewhere");
});

test("a file that imports anything but defineDeck is refused, and so is one with no deck", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "deck-json-"));
  try {
    const code = path.join(dir, "code.config.js");
    await writeFile(code, 'import fs from "node:fs";\nexport default { title: "x", slides: [] };\n');
    await assert.rejects(readDeckModule(code), /imports something other than defineDeck/);

    const none = path.join(dir, "none.config.js");
    await writeFile(none, "export default 42;\n");
    await assert.rejects(readDeckModule(none), /does not export a deck/);

    const ok = path.join(dir, "ok.config.js");
    await writeFile(ok, 'import { defineDeck } from "../../src/deck/types.js";\nexport default defineDeck({ title: "T", slides: [{ title: "a" }] });\n');
    assert.deepEqual(await readDeckModule(ok), { title: "T", slides: [{ title: "a" }] });

    const pointer = path.join(dir, "deck.config.js");
    await writeFile(pointer, 'export { default } from "./ok.config.js";\n');
    assert.equal((await readDeckModule(pointer)).title, "T");

    await assert.rejects(resolveDeckFile(path.join(dir, "missing.js")), /no deck at/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
