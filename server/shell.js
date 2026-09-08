/* The wall's page, with a deck written into it.

   The build produces one index.html that names no deck. The server
   reads it and, per request, writes the deck in as JSON in a script
   tag — along with the title, a description and the link-preview tags
   — so the page arrives knowing what it is, with no second request and
   no flash of the wrong name. src/deck/source.ts is the other end.

   Two escapes matter. Text and attributes are escaped as HTML. The
   JSON has every `<` written as \\u003c, so a deck that contains the
   characters </script> cannot end the tag early — that, and nothing
   about the deck's contents, is what keeps a shared origin safe. */

const esc = (/** @type {unknown} */ s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const json = (/** @type {unknown} */ v) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/**
 * @param {string} html the shell, as built or as Vite transforms it
 * @param {object} page
 * @param {unknown} page.payload what src/deck/source.ts reads
 * @param {string} page.title
 * @param {string} [page.description]
 * @param {string} [page.canonical] the public address, for previews
 * @param {boolean} [page.noindex]
 * @param {boolean} [page.rootAssets] rewrite the build's ./assets to /assets, for a page served a directory deep
 */
export function renderShell(html, page) {
  let out = html;
  if (page.rootAssets) out = out.replace(/(href|src)="\.\//g, '$1="/');
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);

  const head = [];
  if (page.description) head.push(`<meta name="description" content="${esc(page.description)}" />`);
  if (page.noindex) head.push(`<meta name="robots" content="noindex" />`);
  head.push(`<meta property="og:title" content="${esc(page.title)}" />`);
  if (page.description) head.push(`<meta property="og:description" content="${esc(page.description)}" />`);
  if (page.canonical) {
    head.push(`<meta property="og:url" content="${esc(page.canonical)}" />`);
    head.push(`<link rel="canonical" href="${esc(page.canonical)}" />`);
  }
  head.push(`<meta property="og:type" content="website" />`);
  head.push(`<script type="application/json" id="deck">${json(page.payload)}</script>`);
  return out.replace("</head>", `    ${head.join("\n    ")}\n  </head>`);
}
