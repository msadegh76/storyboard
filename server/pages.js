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
  table.keys { width:100%; border-collapse:collapse; margin:0 0 1rem; font-size:0.88rem; }
  table.keys th { text-align:left; font-weight:600; font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--ink-soft); padding:0 0.6rem 0.4rem 0; }
  table.keys td { padding:0.55rem 0.6rem 0.55rem 0; border-top:1px solid var(--line); vertical-align:baseline; }
  table.keys td:last-child, table.keys th:last-child { text-align:right; padding-right:0; }
  table.keys .idle { color:var(--ink-soft); }
  table.keys button { font-size:0.8rem; padding:0.25rem 0.7rem; }
  form.new { display:block; }
  form.new input[type=text] { width: 100%; max-width: 28rem; margin-bottom: 0.8rem; }
  .tpls { display:grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.6rem; margin: 0 0 1rem; }
  .tpl { display:block; padding: 0.7rem 0.9rem; border:1px solid var(--line); border-radius: 8px; background: var(--panel); cursor: pointer; }
  .tpl:has(input:checked) { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .tpl input { margin: 0 0.4rem 0 0; vertical-align: -1px; }
  .tpl b { font-weight: 600; }
  .tpl span { display:block; font-size: 0.8rem; color: var(--ink-soft); margin-top: 0.15rem; }
  footer.foot { margin-top: 3.5rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 0.8rem; color: var(--ink-soft); display:flex; gap: 1rem; flex-wrap: wrap; }
  footer.foot a { color: var(--ink-soft); }
  .guest { padding: 0.8rem 1rem; border: 1px solid var(--accent); border-radius: 8px; background: var(--panel); max-width: 60ch; }
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
 * @param {{ sent?: string, how?: "log" | "resend" | "smtp", error?: string, next?: string, logMode: boolean }} o
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
 * @param {{ user: { email: string }, guest?: boolean, decks: DeckRow[], templates: { name: string, title: string, blurb: string }[], error?: string }} o
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

  const choices = [{ name: "blank", title: "A bare wall", blurb: "Nothing on it yet. Press E and add the first slide." }]
    .concat(o.templates)
    .map(
      (t, i) =>
        `<label class="tpl"><input type="radio" name="from" value="${esc(t.name)}"${i === 0 ? " checked" : ""} /><b>${esc(t.title)}</b><span>${esc(t.blurb)}</span></label>`,
    )
    .join("\n");

  const guest = o.guest
    ? `<p class="guest">This wall is a guest's: yours for a week, on this browser. Press <b>Publish</b> on it and give an email to keep it, and to put it at a link.</p>`
    : "";
  return layout(
    "Your decks",
    `<h1>Your decks</h1>
${guest}
${o.error ? `<p class="bad-note">${esc(o.error)}</p>` : ""}
${o.decks.length ? `<ul class="decks">${rows}</ul>` : `<p class="note">Nothing yet. A deck starts as a bare wall, or from one of the templates below.</p>`}
<h2>New deck</h2>
<form class="new" method="post" action="/api/decks">
  <input type="text" name="title" placeholder="What it is called" maxlength="200" required />
  <div class="tpls">${choices}</div>
  <button class="go" type="submit">Start it</button>
</form>
<p class="note">It opens on the wall with the editor beside it. Nobody sees it until you publish.</p>
<footer class="foot"><a href="/welcome">The wall, as a visitor sees it</a><a href="/developers">For developers</a></footer>`,
    { user: o.guest ? { email: "a guest" } : o.user },
  );
}

/**
 * The corner for people with a terminal: a token, how to push a deck
 * written in a file, and how to hand the wall to an assistant. Off the
 * home page, where it read as the whole product being for developers.
 * @param {{ user: { email: string }, token?: string, baseUrl: string, tokens?: { prefix: string, created_at: string, last_seen: string | null }[] }} o
 */
export function developersPage(o) {
  /* Only the first characters of each, which is what a client's
     configuration shows too — enough to tell one from another, and no
     use to anyone reading over a shoulder. */
  const keys = o.tokens?.length
    ? `<h2>Tokens you have out</h2>
<table class="keys">
<tr><th>Token</th><th>Made</th><th>Last used</th><th>&nbsp;</th></tr>
${o.tokens
  .map(
    (t) => `<tr>
  <td><code>${esc(t.prefix)}…</code></td>
  <td>${esc(ago(t.created_at))}</td>
  <td${t.last_seen ? ">" : ' class="idle">never'}${t.last_seen ? esc(ago(t.last_seen)) : ""}</td>
  <td><form method="post" action="/api/auth/token/${esc(t.prefix)}/delete"><button class="quiet" type="submit">Revoke</button></form></td>
</tr>`,
  )
  .join("")}
</table>
<p class="note">Revoking one stops it at once, wherever it is: whatever holds it — an assistant, a script — is signed out of this wall and has to be given a new one. Nothing else you have out is affected.</p>`
    : "";
  const token = o.token
    ? `<h2>Your token</h2><p>Shown once. Put it in <code>STORYBOARD_TOKEN</code> where you run <code>pnpm push</code>, or in the line below.</p><div class="token">${esc(o.token)}</div>`
    : "";
  return layout(
    "For developers",
    `<h1>For developers</h1>
<p>A deck can also be written as a file — <code>deck.config.js</code> in a checkout of Storyboard — and put on this wall from the terminal, pictures and all:</p>
<p><code>STORYBOARD_TOKEN=… pnpm push --to ${esc(o.token ? "this wall's address" : "https://…")} --publish</code></p>
<p class="note">It needs a token, which stands in for your sign-in for a year and can be made here as often as you like.</p>
${token}
<form method="post" action="/api/auth/token"><button class="quiet" type="submit">Make a token</button></form>
${keys}

<h2>Your own assistant</h2>
<p>The same token hands this wall to whatever AI you already use — it speaks <a href="https://modelcontextprotocol.io">MCP</a>. Then you can say <em>make me a deck about the quarter, six stops</em> and it will, slide by slide, and publish it when you say so.</p>
<p><code>claude mcp add --transport http storyboard ${esc(o.baseUrl)}/api/mcp --header "Authorization: Bearer ${esc(o.token || "YOUR_TOKEN")}"</code></p>
<p class="note">In another client, the address is <code>${esc(o.baseUrl)}/api/mcp</code> and the token goes in an <code>Authorization: Bearer …</code> header. Your assistant does the thinking on your account; this wall never calls a model and holds no key of yours. It can write, rearrange and publish every deck you own, for a year, so treat it as the password it is — and if you stop trusting one, revoke it above.</p>
<p class="note">Pictures are the one thing it cannot do: it writes the words, and you drop the photos on the wall yourself.</p>
<footer class="foot"><a href="/">Your decks</a></footer>`,
    { user: o.user },
  );
}

/**
 * What a visitor reads over the landing wall: what this is, and the
 * one thing to do next. Laid over the wall by shell.js; the wall itself
 * is a template, walking itself for a few stops. Styles live with the
 * HUD's. With guests allowed the one thing is "try it"; without, it is
 * signing in.
 * @param {{ signedIn: boolean, guests: boolean }} o
 */
export function landingAside(o) {
  const cta = o.signedIn
    ? `<a class="go" href="/">Your decks</a>`
    : o.guests
      ? `<a class="go" href="/try">Try it, no account</a><a href="/signin">Sign in</a>`
      : `<a class="go" href="/signin">Sign in</a>`;
  return `<aside id="landing" aria-label="About Storyboard">
  <b class="mark">Storyboard<i>&nbsp;•</i></b>
  <p>Your slides, as a wall: index cards on plaster, walked with a swipe or the arrow keys. This one is walking itself. Write your own on it in a minute; give an email only when you want to keep it.</p>
  <div class="acts">${cta}</div>
</aside>`;
}

/** @param {string} title @param {string} text @param {{ user?: { email: string } | null, back?: string }} [o] */
export function messagePage(title, text, o = {}) {
  return layout(
    title,
    `<h1>${esc(title)}</h1><p>${esc(text)}</p>${o.back ? `<p class="note"><a href="${esc(o.back)}">Back</a></p>` : ""}`,
    { user: o.user },
  );
}
