/* A picture on its way in, and where it is kept. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { sizePicture, MAX_EDGE } from "./assets.js";
import { diskStorage, checkKey } from "./storage.js";

const make = (width, height, format = "png", extra = (s) => s) =>
  extra(sharp({ create: { width, height, channels: 3, background: "#6d5334" } }))[format]().toBuffer();

test("a big picture is cut to the wall's size; a small one is not enlarged", async () => {
  const big = await sizePicture(await make(4000, 3000));
  assert.equal(big.width, MAX_EDGE);
  assert.equal(big.height, 1536);
  assert.equal(big.mime, "image/webp");
  assert.match(big.file, /^[0-9a-f]{20}\.webp$/);
  const small = await sizePicture(await make(300, 200, "jpeg"));
  assert.equal(small.width, 300);
  assert.equal(small.height, 200);
  const tall = await sizePicture(await make(1000, 5000));
  assert.equal(tall.height, MAX_EDGE);
  assert.equal(tall.width, 410);
});

test("the same picture is the same file; a different one is not", async () => {
  const a = await sizePicture(await make(100, 100));
  const b = await sizePicture(await make(100, 100));
  const c = await sizePicture(await make(100, 101));
  assert.equal(a.file, b.file);
  assert.notEqual(a.file, c.file);
});

test("every format the wall accepts decodes, and an SVG is rasterized", async () => {
  for (const format of ["png", "jpeg", "webp", "gif", "avif"]) {
    const out = await sizePicture(await make(64, 48, format));
    assert.equal(out.width, 64, format);
    assert.equal(out.height, 48, format);
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#d97a3f"/></svg>');
  const out = await sizePicture(svg);
  assert.equal(out.mime, "image/webp");
  assert.ok(out.width >= 300 && out.width <= MAX_EDGE, `svg width ${out.width}`);
  assert.ok(Math.abs(out.width / out.height - 2) < 0.02, "the shape is kept");
});

test("a picture that was shot sideways is turned upright", async () => {
  const sideways = await make(600, 400, "jpeg", (s) => s.withMetadata({ orientation: 6 }));
  const out = await sizePicture(sideways);
  assert.equal(out.width, 400);
  assert.equal(out.height, 600);
  // and the tag that said so is gone with the rest of the metadata
  const meta = await sharp(out.data).metadata();
  assert.equal(meta.orientation, undefined);
  assert.equal(meta.exif, undefined);
});

test("what is not a picture is refused with the reason", async () => {
  await assert.rejects(sizePicture(Buffer.from("not a picture")), /not a picture the wall can show/);
  await assert.rejects(sizePicture(Buffer.alloc(0)), /not a picture the wall can show/);
  const html = Buffer.from("<html><body>hi</body></html>");
  await assert.rejects(sizePicture(html), /not a picture the wall can show/);
});

test("the disk store keeps a key under its deck, and nothing outside", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storage-"));
  try {
    const store = diskStorage(dir);
    await store.put("deck1/a.webp", Buffer.from("aaa"));
    await store.put("deck1/b.webp", Buffer.from("bb"));
    await store.put("deck2/a.webp", Buffer.from("a"));
    const got = await store.get("deck1/a.webp");
    assert.equal(got.size, 3);
    const chunks = [];
    for await (const c of got.stream) chunks.push(Buffer.from(c));
    assert.equal(Buffer.concat(chunks).toString(), "aaa");
    assert.equal(await store.get("deck1/nope.webp"), null);
    await store.delete("deck1/b.webp");
    assert.equal(await store.get("deck1/b.webp"), null);
    await store.deleteAll("deck1");
    await assert.rejects(stat(path.join(dir, "deck1")));
    assert.equal((await store.get("deck2/a.webp")).size, 1);

    for (const bad of ["../x", "a/../b", "a/b/c", ".hidden/x", "a/.x", "/etc/passwd", "a", "a/b c"])
      assert.throws(() => checkKey(bad), /not a picture key/, bad);
    await assert.rejects(store.put("../escape", Buffer.from("x")), /not a picture key/);
    await assert.rejects(store.deleteAll("../"), /not a deck/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
