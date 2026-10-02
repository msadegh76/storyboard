/* The printer: a slide as data, written as an author would have.

   Byte for byte what the editor wrote before it edited data — the
   file store's output must not churn a deck that was written by the
   old panel — and a round trip through evaluation for every slide of
   every example deck. */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { printCard, printSlide } from "../src/deck/print.ts";
import { readDeckModule } from "./deck-json.mjs";
import { ROOT } from "../server/config.js";

const evaluate = (text) => new Function(`return (${text})`)();

test("one card, flat, keys in the order they were put in", () => {
  assert.equal(printSlide({ title: "A", text: "B" }), '{\n  title: "A",\n  text: "B",\n}');
  assert.equal(printSlide({ text: "B", title: "A" }), '{\n  text: "B",\n  title: "A",\n}');
});

test("what each kind of value looks like on the page", () => {
  assert.equal(
    printSlide({ title: "A", bullets: ["x", "y"] }),
    '{\n  title: "A",\n  bullets: [\n    "x",\n    "y",\n  ],\n}',
  );
  assert.equal(printSlide({ title: "A", pinColor: 0x9a7b3f }), '{\n  title: "A",\n  pinColor: 0x9a7b3f,\n}');
  assert.equal(printSlide({ title: "A", pinColor: 0x0000ff }), '{\n  title: "A",\n  pinColor: 0x0000ff,\n}');
  assert.equal(
    printSlide({ title: "A", table: { head: ["a"], rows: [["1"]] } }),
    '{\n  title: "A",\n  table: {"head":["a"],"rows":[["1"]]},\n}',
  );
  assert.equal(printSlide({ mural: true, sub: "s" }), '{\n  mural: true,\n  sub: "s",\n}');
  assert.equal(printSlide({ mural: "H", rule: false, ink: false }), '{\n  mural: "H",\n  rule: false,\n  ink: false,\n}');
  assert.equal(printSlide({ title: "A", w: 5.25, rot: -1.5, x: 0, y: 12 }), '{\n  title: "A",\n  w: 5.25,\n  rot: -1.5,\n  x: 0,\n  y: 12,\n}');
  assert.equal(printSlide({ title: 'say "hi"\nthen', text: "back\\slash" }), '{\n  title: "say \\"hi\\"\\nthen",\n  text: "back\\\\slash",\n}');
});

test("a value that is undefined is not written; a bare string is a string", () => {
  assert.equal(printSlide({ title: "A", text: undefined, foot: "f" }), '{\n  title: "A",\n  foot: "f",\n}');
  assert.equal(printSlide("just words"), '"just words"');
  assert.equal(printCard("x", "    "), '"x"');
});

test("several cards are held together; one is written straight in", () => {
  assert.equal(
    printSlide({ notes: [{ title: "A" }, { title: "B", text: "b" }] }),
    '{\n  notes: [\n    {\n      title: "A",\n    },\n    {\n      title: "B",\n      text: "b",\n    },\n  ],\n}',
  );
  assert.equal(printSlide({ notes: [{ title: "Only" }] }), '{\n  title: "Only",\n}');
  assert.equal(printSlide({ cards: [{ title: "A" }, "b"] }), '{\n  notes: [\n    {\n      title: "A",\n    },\n    "b",\n  ],\n}');
});

test("what the panel adds, exactly as the old panel wrote it", () => {
  assert.equal(printSlide({ title: "New card", text: "Say something here." }), '{\n  title: "New card",\n  text: "Say something here.",\n}');
  assert.equal(printSlide({ mural: "New heading", sub: "a smaller line under it" }), '{\n  mural: "New heading",\n  sub: "a smaller line under it",\n}');
  assert.equal(printSlide({ image: "slides/x.png", title: "New picture" }), '{\n  image: "slides/x.png",\n  title: "New picture",\n}');
  assert.equal(printSlide({ type: "photo", title: "New picture" }), '{\n  type: "photo",\n  title: "New picture",\n}');
});

test("every slide of every example survives a round trip through evaluation", async () => {
  for (const name of ["hello-wall", "lighthouse-bakery", "onboarding"]) {
    const deck = await readDeckModule(path.join(ROOT, "examples", name, "deck.config.js"));
    deck.slides.forEach((slide, i) => {
      const text = printSlide(slide);
      const back = evaluate(text);
      // a single card held in `notes` comes back flat — the same slide to the wall
      const want = slide.notes?.length === 1 ? slide.notes[0] : slide.cards ? { notes: slide.cards } : slide;
      assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(want)), `${name} slide ${i + 1}`);
      // and printed again it is the same text: the printer is stable
      assert.equal(printSlide(back), text, `${name} slide ${i + 1} reprinted`);
    });
  }
});
