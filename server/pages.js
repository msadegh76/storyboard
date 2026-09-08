/* The pages that are not the wall: sign in, home, and what is said
   when a deck is not there.

   Server-rendered, no script, in the presenter window's manner: a page
   of text about pages of pictures. Everything written into them is
   escaped; nothing here trusts a deck's title. */

const esc = (/** @type {unknown} */ s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* "3 days ago" */
export function ago(/** @type {string | null | undefined} */ iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const CSS = `
  :root { --cream:#efe9df; --ink:#2b241c; --ink-soft:#6f655a; --accent:#d97a3f; --line:#dcd3c4; --panel:#f7f3ec; --field:#fff; --bad:#b0472c; }
  @media (prefers-color-scheme: dark) { :root { --cream:#1e1c1a; --ink:#efe9df; --ink-soft:#a89e90; --line:#3f3b36; --panel:#2a2724; --field:#3b3936; --bad:#e0745a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--cream); color:var(--ink); font-family:"Inter",system-ui,sans-serif; font-size:15px; line-height:1.55; }
  main { max-width: 44rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  header.top { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; margin-bottom:2.5rem; }
  .mark { font-family:"Cormorant Garamond",Georgia,serif; font-weight:600; font-size:1.5rem; letter-spacing:-0.01em; text-decoration:none; color:var(--ink); }
  .mark i { font-style:normal; color:var(--accent); }
  .who { font-size:0.85rem; color:var(--ink-soft); display:flex; gap:0.8rem; align-items:baseline; }
  h1 { font-family:"Cormorant Garamond",Georgia,serif; font-weight:600; font-size:2.2rem; line-height:1.1; margin:0 0 0.6rem; }
  h2 { font-size:0.75rem; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-soft); margin:2.5rem 0 0.8rem; }
  p { margin: 0 0 1rem; max-width: 60ch; }
  a { color: var(--ink); }
  form { display:flex; flex-wrap:wrap; gap:0.6rem; align-items:center; }
  input[type=text], input[type=email], select { font:inherit; padding:0.5rem 0.7rem; border:1px solid var(--line); border-radius:6px; background:var(--field); color:var(--ink); min-width: 14rem; }
  button { font:inherit; font-weight:500; padding:0.5rem 0.95rem; border-radius:999px; border:1px solid var(--line); background:var(--panel); color:var(--ink); cursor:pointer; }
  button.go { background:var(--accent); border-color:var(--accent); color:#fff; }
  button.quiet { font-size:0.8rem; padding:0.3rem 0.7rem; }
  button.bad { color:var(--bad); }
  .note { font-size:0.85rem; color:var(--ink-soft); }
  .bad-note { color: var(--bad); }
  ul.decks { list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
  ul.decks li { display:grid; grid-template-columns: 1fr auto; gap:0.4rem 1rem; padding:0.9rem 0; border-bottom:1px solid var(--line); align-items:center; }
  ul.decks b { font-weight:600; }
  ul.decks .state { font-size:0.82rem; color:var(--ink-soft); }
  ul.decks .acts { display:flex; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end; }
  ul.decks .acts a { font-size:0.8rem; padding:0.3rem 0.7rem; border:1px solid var(--line); border-radius:999px; text-decoration:none; background:var(--panel); }
  ul.decks .acts a.go { background:var(--accent); border-color:var(--accent); color:#fff; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 0.88em; background: var(--panel); padding: 0.1em 0.35em; border-radius: 3px; }
  .token { font-family: ui-monospace, Menlo, monospace; word-break: break-all; padding: 0.8rem 1rem; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
`;

/**
 * @param {string} title
 * @param {string} body
 * @param {{ user?: { email: string } | null }} [opts]
 */
export function layout(title, body, opts = {}) {
  const who = opts.user
    ? `<span class="who">${esc(opts.user.email)} <form method="post" action="/api/auth/signout"><button class="quiet" type="submit">Sign out</button></form></span>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
<main>
<header class="top"><a class="mark" href="/">Storyboard<i>&nbsp;•</i></a>${who}</header>
${body}
</main>
</body>
</html>`;
}

/**
 * @param {{ sent?: string, how?: "log" | "resend", error?: string, next?: string, logMode: boolean }} o
 */
export function signinPage(o) {
  if (o.sent) {
    const where =
      o.how === "log"
        ? `<p>This wall has no mail set up, so the link was <b>printed in the server's log</b> — the terminal running it. Open the link from there.</p>`
        : `<p>Open the link in the email to sign in. It works once, for fifteen minutes.</p>`;
    return layout(
      "Check your email",
      `<h1>A link is on its way</h1><p>Sent to <b>${esc(o.sent)}</b>.</p>${where}<p class="note"><a href="/signin">Ask again</a></p>`,
    );
  }
  const hint = o.logMode
    ? `<p class="note">No mail is configured on this wall: the link will be printed in the server's log instead of sent.</p>`
    : "";
  return layout(
    "Sign in",
    `<h1>Sign in</h1>
<p>Your email address, and a link comes back. No password.</p>
${o.error ? `<p class="bad-note">${esc(o.error)}</p>` : ""}
<form method="post" action="/api/auth/link">
  <input type="email" name="email" placeholder="you@example.com" required autofocus />
  ${o.next ? `<input type="hidden" name="next" value="${esc(o.next)}" />` : ""}
  <button class="go" type="submit">Send me a link</button>
</form>
${hint}`,
  );
}

/**
 * @typedef {{ id: string, slug: string, title: string, visibility: string, url: string, editUrl: string, published_at: string | null, updated_at: string, dirty: boolean, slides: number }} DeckRow
 */

/**
 * @param {{ user: { email: string }, decks: DeckRow[], examples: { name: string, title: string }[], token?: string, error?: string }} o
 */
export function homePage(o) {
  const rows = o.decks
    .map((d) => {
      const state = !d.published_at
        ? `Draft only · ${d.slides} slide${d.slides === 1 ? "" : "s"}`
        : `Published ${ago(d.published_at)}${d.dirty ? " · unpublished changes" : ""}${d.visibility !== "public" ? ` · ${d.visibility}` : ""}`;
      return `<li>
  <div><b>${esc(d.title)}</b><br /><span class="state">${esc(state)} · <a href="${esc(d.url)}">${esc(d.url.replace(/^https?:\/\//, ""))}</a></span></div>
  <div class="acts">
    <a class="go" href="${esc(d.editUrl)}">Edit</a>
    ${d.published_at ? `<a href="${esc(d.url)}">View</a>` : ""}
    <form method="post" action="/api/decks/${esc(d.id)}/delete" onsubmit="return confirm('Delete “${esc(d.title).replace(/'/g, "\\'")}” and its pictures? This cannot be undone.')"><button class="quiet bad" type="submit">Delete</button></form>
  </div>
</li>`;
    })
    .join("\n");

  const options = [`<option value="blank">A bare wall</option>`]
    .concat(o.examples.map((e) => `<option value="${esc(e.name)}">${esc(e.title)} (example)</option>`))
    .join("");

  const token = o.token
    ? `<h2>A token for pnpm push</h2><p>Shown once. Put it in <code>STORYBOARD_TOKEN</code> where you run <code>pnpm push</code>.</p><div class="token">${esc(o.token)}</div>`
    : "";

  return layout(
    "Your decks",
    `<h1>Your decks</h1>
${o.error ? `<p class="bad-note">${esc(o.error)}</p>` : ""}
${o.decks.length ? `<ul class="decks">${rows}</ul>` : `<p class="note">Nothing yet. A deck starts as a bare wall, or as one of the examples.</p>`}
<h2>New deck</h2>
<form method="post" action="/api/decks">
  <input type="text" name="title" placeholder="What it is called" maxlength="200" required />
  <select name="from">${options}</select>
  <button class="go" type="submit">Start it</button>
</form>
<p class="note">It opens on the wall with the editor beside it. Nobody sees it until you publish.</p>
${token}
<h2>From a checkout</h2>
<p class="note">A deck written in a file can be put here with <code>pnpm push</code>. It needs a token:</p>
<form method="post" action="/api/auth/token"><button class="quiet" type="submit">Make a token</button></form>`,
    { user: o.user },
  );
}

/** @param {string} title @param {string} text @param {{ user?: { email: string } | null, back?: string }} [o] */
export function messagePage(title, text, o = {}) {
  return layout(
    title,
    `<h1>${esc(title)}</h1><p>${esc(text)}</p>${o.back ? `<p class="note"><a href="${esc(o.back)}">Back</a></p>` : ""}`,
    { user: o.user },
  );
}
