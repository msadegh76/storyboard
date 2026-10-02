/* The built page, with a deck written into it. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderShell } from "./shell.js";

const SHELL = `<!doctype html>
<html><head>
<title>Storyboard</title>
<link rel="icon" href="./favicon.svg" />
<link rel="stylesheet" href="./assets/index-1.css">
</head><body><script type="module" src="./assets/index-1.js"></script></body></html>`;

test("the title is replaced and escaped, and the JSON cannot close its own tag", () => {
  const out = renderShell(SHELL, {
    payload: { deck: { title: "</script><img src=x onerror=alert(1)>", slides: [] }, note: "a b" },
    title: `Tom & "Jerry" <3`,
    description: `x "y" <z>`,
  });
  assert.match(out, /<title>Tom &amp; &quot;Jerry&quot; &lt;3<\/title>/);
  assert.equal(out.match(/<title>/g).length, 1);
  assert.doesNotMatch(out, /<\/script><img/);
  assert.match(out, /\\u003c\/script>\\u003cimg src=x onerror=alert\(1\)>/);
  assert.match(out, /a\\u2028b/);
  assert.match(out, /<meta name="description" content="x &quot;y&quot; &lt;z&gt;" \/>/);
  // it parses back to what went in
  const json = /<script type="application\/json" id="deck">(.*?)<\/script>/s.exec(out)[1];
  assert.equal(JSON.parse(json).deck.title, "</script><img src=x onerror=alert(1)>");
  assert.equal(JSON.parse(json).note, "a b");
});

test("the build's ./assets are served from the root when asked, and left alone when not", () => {
  const rooted = renderShell(SHELL, { payload: {}, title: "t", rootAssets: true });
  assert.match(rooted, /href="\/favicon\.svg"/);
  assert.match(rooted, /href="\/assets\/index-1\.css"/);
  assert.match(rooted, /src="\/assets\/index-1\.js"/);
  const dev = renderShell(SHELL, { payload: {}, title: "t" });
  assert.match(dev, /src="\.\/assets\/index-1\.js"/);
});

test("previews and robots", () => {
  const out = renderShell(SHELL, { payload: {}, title: "t", canonical: "https://wall.test/d/x", noindex: true, description: "d" });
  assert.match(out, /<meta property="og:url" content="https:\/\/wall.test\/d\/x" \/>/);
  assert.match(out, /<link rel="canonical" href="https:\/\/wall.test\/d\/x" \/>/);
  assert.match(out, /<meta name="robots" content="noindex" \/>/);
  assert.match(out, /<meta property="og:description" content="d" \/>/);
  const listed = renderShell(SHELL, { payload: {}, title: "t" });
  assert.doesNotMatch(listed, /noindex/);
  assert.doesNotMatch(listed, /canonical/);
});
