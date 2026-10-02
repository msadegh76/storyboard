/* The slide operations on a document, and the diff a publish sheet reads. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  replaceSlide,
  insertSlide,
  removeSlide,
  moveSlide,
  setFields,
  describeChanges,
} from "./ops.js";

const deck = () => ({
  title: "T",
  slides: [{ title: "A" }, { title: "B" }, { notes: [{ title: "C1" }, { title: "C2" }] }],
});
const titles = (d) => d.slides.map((s) => s.title ?? s.notes.map((c) => c.title).join("+"));

test("replaceSlide swaps one slide and leaves the original alone", () => {
  const d = deck();
  const out = replaceSlide(d, 2, { title: "B2" });
  assert.deepEqual(titles(out), ["A", "B2", "C1+C2"]);
  assert.deepEqual(titles(d), ["A", "B", "C1+C2"]);
  assert.throws(() => replaceSlide(d, 4, { title: "x" }), RangeError);
  assert.throws(() => replaceSlide(d, 0, { title: "x" }), RangeError);
});

test("insertSlide after 0 is the front, after the last is the end", () => {
  const d = deck();
  assert.deepEqual(titles(insertSlide(d, 0, { title: "F" })), ["F", "A", "B", "C1+C2"]);
  assert.deepEqual(titles(insertSlide(d, 3, { title: "L" })), ["A", "B", "C1+C2", "L"]);
  assert.deepEqual(titles(insertSlide(d, 1, { title: "M" })), ["A", "M", "B", "C1+C2"]);
  assert.throws(() => insertSlide(d, 4, { title: "x" }), RangeError);
  assert.deepEqual(titles(insertSlide({ title: "E", slides: [] }, 0, { title: "only" })), ["only"]);
});

test("removeSlide hands back what it took", () => {
  const { deck: out, removed } = removeSlide(deck(), 2);
  assert.deepEqual(titles(out), ["A", "C1+C2"]);
  assert.deepEqual(removed, { title: "B" });
});

test("moveSlide there and back restores the order", () => {
  const d = deck();
  assert.deepEqual(titles(moveSlide(d, 1, 3)), ["B", "C1+C2", "A"]);
  assert.deepEqual(titles(moveSlide(moveSlide(d, 1, 3), 3, 1)), titles(d));
  assert.deepEqual(titles(moveSlide(d, 2, 2)), titles(d));
});

test("setFields sets and takes out, and refuses what the panel may not set", () => {
  const out = setFields({ title: "T", room: "night", slides: [] }, { room: null, wall: "#aabbcc" });
  assert.deepEqual(out, { title: "T", wall: "#aabbcc", slides: [] });
  assert.throws(() => setFields(deck(), { slides: "x" }), RangeError);
  assert.throws(() => setFields(deck(), { room: 3 }), RangeError);
});

test("describeChanges matches slides by content, not by position", () => {
  const before = deck();
  assert.deepEqual(describeChanges(before, before), { added: 0, removed: 0, changed: 0, fields: [] });
  assert.deepEqual(describeChanges(before, insertSlide(before, 0, { title: "F" })), {
    added: 1, removed: 0, changed: 0, fields: [],
  });
  assert.deepEqual(describeChanges(before, replaceSlide(before, 2, { title: "B2" })), {
    added: 0, removed: 0, changed: 1, fields: [],
  });
  assert.deepEqual(describeChanges(before, removeSlide(before, 1).deck), {
    added: 0, removed: 1, changed: 0, fields: [],
  });
  assert.deepEqual(describeChanges(before, setFields(before, { room: "studio" })), {
    added: 0, removed: 0, changed: 0, fields: ["room"],
  });
  // never published: everything is new, and no field counts as changed
  assert.deepEqual(describeChanges(null, before), { added: 3, removed: 0, changed: 0, fields: [] });
});
