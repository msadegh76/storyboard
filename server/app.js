/* The server, as one Hono app.

   What it does, in the order a request meets it: work out who is
   here, refuse a write that did not come from this site, serve the
   built wall's own files, then the pages — sign in, home, the
   published wall at /d/:slug, the draft at /edit/:slug — and under
   /api the calls the panel makes, which mirror the six the dev
   server's plugin answers (tools/deck-editor.js), plus publishing.

   The app is built by a function so it can be run three ways with the
   same routes: under `pnpm dev` beside Vite (vite.js), on its own in
   front of dist/ (index.js), and in a test with a database in memory. */

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { makeAuth, AuthError, isGuest } from "./auth.js";
import { makeDecks, HttpError } from "./decks.js";
import { replaceSlide, insertSlide, removeSlide, moveSlide, setFields } from "./ops.js";
import { ValidationError } from "./validate.js";
import { renderShell } from "./shell.js";
import { signinPage, homePage, messagePage, developersPage, landingAside } from "./pages.js";
import { TEMPLATES, isExample, readExample, importPictures, publicReader } from "./examples.js";
import { mcpRoute } from "./mcp.js";

/** @typedef {import("../src/deck/types.ts").Deck} Deck */
/** @typedef {import("../src/deck/types.ts").Slide} Slide */
/** @typedef {import("hono").Context} Context */

/** What is known about a request once it has been looked at. */
/** @typedef {{ user: import("./auth.js").User | null, viaToken: boolean, session: string | undefined }} Seen */

const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * @param {object} deps
 * @param {import("./config.js").Config} deps.config
 * @param {import("node:sqlite").DatabaseSync} deps.db
 * @param {import("./storage.js").Storage} deps.storage
 * @param {import("./mail.js").Mailer} deps.mail
 * @param {(url: string) => Promise<string>} deps.shell the wall's page, before a deck is written into it
 */
export function createApp({ config, db, storage, mail, shell }) {
  const auth = makeAuth({ db, config, mail });
  const decks = makeDecks({ db, storage, config });
  const app = new Hono();
  const homePath = config.dev ? "/home" : "/";
  const logMode = mail.kind === "log";

  /* ---- small helpers ---- */

  /** The address links are built on: the request's own under Vite, the configured one otherwise. */
  const originOf = (/** @type {Context} */ c) => (config.dev ? new URL(c.req.url).origin : config.baseUrl);
  const isForm = (/** @type {Context} */ c) =>
    /form-urlencoded|multipart/.test(c.req.header("content-type") || "");
  /* Keyed by the context, which is one object for the whole request.
     Not by the raw Request: the body-limit middleware swaps that for a
     wrapped one on the way in, and a lookup by it would miss. */
  /** @type {WeakMap<object, Seen>} */
  const seen = new WeakMap();
  const seenOf = (/** @type {Context} */ c) =>
    seen.get(c) ?? { user: null, viaToken: false, session: undefined };
  const userOf = (/** @type {Context} */ c) => seenOf(c).user;
  const param = (/** @type {Context} */ c, /** @type {string} */ name) => String(c.req.param(name) ?? "");

  /** @param {Context} c @returns {Promise<Record<string, any>>} */
  async function bodyOf(c) {
    const type = c.req.header("content-type") || "";
    if (type.includes("application/json")) {
      try {
        const v = await c.req.json();
        return v && typeof v === "object" ? v : {};
      } catch {
        throw new HttpError(400, "the body was not JSON");
      }
    }
    if (/form-urlencoded|multipart/.test(type)) return c.req.parseBody();
    return {};
  }

  /** A whole number from the wire, or a complaint. */
  const whole = (/** @type {unknown} */ v, /** @type {string} */ what) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new HttpError(400, `${what} must be a whole number`);
    return n;
  };
  const revOf = (/** @type {Record<string, unknown>} */ body) =>
    body.rev == null ? null : whole(body.rev, "rev");

  /** Only somewhere on this site. */
  const localPath = (/** @type {unknown} */ p) =>
    typeof p === "string" && /^\/(?!\/)[^\s]*$/.test(p) ? p : null;

  const status = (/** @type {number} */ n) => /** @type {any} */ (n);

  /* Too much to take in one request — said before any of it is read.
     Hono's own refusal is an HTTPException, which the error handler
     knows; the message is ours. */
  const tooMuch = () => {
    throw new HttpError(413, "that is too much to take in one request");
  };

  /* ---- who is here ---- */

  app.use("*", async (c, next) => {
    const bearer = (c.req.header("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const cookie = getCookie(c, auth.cookie);
    const user = auth.userOf(bearer || cookie);
    seen.set(c, { user, viaToken: !!bearer, session: cookie });
    if (bearer && user) auth.touch(bearer);
    await next();
  });

  /* A write must come from this site. A tool with a bearer token is
     not a browser and has no origin to check; a browser always sends
     one on a POST, and a page on another site sends its own. This is
     the plugin's localhost check, grown up. */
  app.use("*", async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method) || seenOf(c).viaToken) return next();
    /* MCP is a token door and nothing else — mcp.js turns away a cookie
       session itself — so there is no browser to protect here, and a
       client with no token must meet 401, the word it listens for,
       rather than this. */
    if (c.req.path === "/api/mcp") return next();
    const origin = c.req.header("origin") || "";
    const ok = config.dev ? LOCAL.test(origin) : origin === config.baseUrl;
    if (!ok) throw new HttpError(403, "that request did not come from this site");
    await next();
  });

  /* ---- what went wrong ---- */

  app.onError((err, c) => {
    const st =
      err instanceof HttpError || err instanceof AuthError || err instanceof HTTPException
        ? err.status
        : err instanceof ValidationError
          ? 400
          : 500;
    if (st === 500) console.error(err);
    const msg = st === 500 ? "something went wrong on the server" : err.message;
    const extra = err instanceof HttpError ? err.extra : {};
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/a/"))
      return c.json({ error: msg, ...extra }, status(st));
    return c.html(
      messagePage(st === 404 ? "Not here" : "Something went wrong", msg, { user: userOf(c), back: homePath }),
      status(st),
    );
  });
  app.notFound((c) =>
    c.req.path.startsWith("/api/")
      ? c.json({ error: `no ${c.req.path} here` }, 404)
      : c.html(messagePage("Not here", "There is nothing at this address.", { user: userOf(c), back: homePath }), 404),
  );

  /* ---- the built wall's own files (Vite serves them in dev) ---- */

  if (!config.dev) {
    const dist = path.resolve(config.distDir);
    const serveDist = async (/** @type {Context} */ c, /** @type {string} */ rel, /** @type {string} */ cache) => {
      const file = path.resolve(dist, "." + rel);
      if (!file.startsWith(dist + path.sep)) throw new HttpError(404, "not here");
      let s;
      try {
        s = await stat(file);
      } catch {
        throw new HttpError(404, "not here");
      }
      if (!s.isFile()) throw new HttpError(404, "not here");
      const type = TYPES[/** @type {keyof typeof TYPES} */ (path.extname(file))] || "application/octet-stream";
      return c.body(/** @type {any} */ (Readable.toWeb(createReadStream(file))), 200, {
        "content-type": type,
        "content-length": String(s.size),
        "cache-control": cache,
      });
    };
    app.get("/assets/*", (c) => serveDist(c, c.req.path, "public, max-age=31536000, immutable"));
    app.get("/demo/*", (c) => serveDist(c, c.req.path, "public, max-age=86400"));
    for (const f of ["/favicon.svg", "/icons.svg"])
      app.get(f, (c) => serveDist(c, f, "public, max-age=86400"));
    app.get("/present.html", (c) => serveDist(c, "/present.html", "no-cache"));
    app.get("/present", (c) => serveDist(c, "/present.html", "no-cache"));
  }

  /* ---- sign in ---- */

  app.get("/signin", (c) => {
    if (userOf(c)) return c.redirect(homePath);
    return c.html(signinPage({ logMode, next: localPath(c.req.query("next")) ?? undefined }));
  });

  app.post("/api/auth/link", bodyLimit({ maxSize: 4096, onError: tooMuch }), async (c) => {
    const body = await bodyOf(c);
    const next = localPath(body.next);
    try {
      const out = await auth.requestLink(String(body.email ?? ""), originOf(c), next);
      if (isForm(c)) return c.html(signinPage({ sent: out.email, how: out.how, logMode }));
      return c.json({ ok: true, how: out.how });
    } catch (err) {
      if (isForm(c) && err instanceof AuthError)
        return c.html(signinPage({ error: err.message, logMode, next: next ?? undefined }), status(err.status));
      throw err;
    }
  });

  app.get("/api/auth/callback", (c) => {
    try {
      const { session, user } = auth.redeem(c.req.query("token") || "", userOf(c));
      setCookie(c, auth.cookie, session, {
        path: "/",
        httpOnly: true,
        secure: config.secureCookies,
        sameSite: "Lax",
        maxAge: auth.sessionDays * 86400,
      });
      /* A guest who asked to keep and publish their wall: now that the
         address is theirs, publish it and land them on the link. */
      const next = localPath(c.req.query("next"));
      const keep = next ? /^\/edit\/([a-z0-9-]+)\?publish=1$/.exec(next) : null;
      if (keep?.[1]) {
        const row = decks.bySlug(keep[1]);
        if (row && row.owner_id === user.id) {
          decks.publish(row.id, null);
          return c.redirect(`/d/${row.slug}`);
        }
      }
      return c.redirect(next ?? homePath);
    } catch (err) {
      if (err instanceof AuthError) return c.html(signinPage({ error: err.message, logMode }), status(err.status));
      throw err;
    }
  });

  app.post("/api/auth/signout", (c) => {
    auth.signOut(seenOf(c).session);
    deleteCookie(c, auth.cookie, { path: "/" });
    return isForm(c) ? c.redirect("/signin") : c.json({ ok: true });
  });

  app.post("/api/auth/token/:prefix/delete", (c) => {
    const user = userOf(c);
    if (!user) throw new HttpError(401, "sign in first");
    auth.revoke(user.id, param(c, "prefix"));
    return isForm(c) ? c.redirect("/developers") : c.json({ ok: true });
  });

  app.post("/api/auth/token", (c) => {
    const user = userOf(c);
    if (!user) throw new HttpError(401, "sign in first");
    const token = auth.createToken(user.id);
    if (isForm(c)) return c.html(developersPage({ user, token, baseUrl: config.baseUrl, tokens: auth.tokens(user.id) }));
    return c.json({ token });
  });

  /* ---- home, and the front door ---- */

  const home = (/** @type {Context} */ c, /** @type {{ error?: string }} */ extra = {}) => {
    const user = userOf(c);
    if (!user) return c.redirect("/signin");
    return c.html(homePage({ user, guest: isGuest(user), decks: decks.list(user.id), templates: TEMPLATES, ...extra }));
  };

  /* Try it, no account.

     A stranger gets a wall to write on before being asked who they
     are: a guest account made on the spot, a deck from a template, and
     the editor. A guest who comes back gets the same deck, not another.
     The email is asked for at Publish, which is when it is worth
     something to them. Guests are only possible where anyone may sign
     up, since claiming a wall is signing up. */
  /** @type {Map<string, number[]>} */
  const tried = new Map();
  const TRIES_PER_HOUR = 30;
  const ipOf = (/** @type {Context} */ c) =>
    (c.req.header("x-forwarded-for") || "").split(",")[0]?.trim() ||
    /** @type {any} */ (c.env)?.incoming?.socket?.remoteAddress ||
    "?";

  const tryIt = async (/** @type {Context} */ c) => {
    if (config.signup !== "open") return c.redirect("/signin");
    const template = param(c, "template") || "product-demo";
    if (!isExample(config.root, template)) throw new HttpError(404, "no such template");
    let user = userOf(c);
    if (!user) {
      const ip = ipOf(c);
      const recent = (tried.get(ip) ?? []).filter((t) => t > Date.now() - 3600_000);
      if (recent.length >= TRIES_PER_HOUR)
        throw new HttpError(429, "that is enough new walls for one hour — sign in to keep going");
      tried.set(ip, [...recent, Date.now()]);
      const made = auth.guest();
      user = made.user;
      setCookie(c, auth.cookie, made.session, {
        path: "/",
        httpOnly: true,
        secure: config.secureCookies,
        sameSite: "Lax",
        maxAge: 7 * 86400,
      });
    }
    // a guest keeps one wall; the same visitor pressing Try again lands on it
    const mine = decks.list(user.id);
    if (isGuest(user) && mine[0]) return c.redirect(mine[0].editUrl);
    const t = TEMPLATES.find((x) => x.name === template);
    const deck = { ...(await readExample(config.root, template)), title: t?.title ?? template };
    const row = decks.create(user.id, { title: deck.title, deck });
    const withPictures = await importPictures(deck, publicReader(config.root), (data) => decks.addPicture(row.id, data));
    decks.applyOp(row.id, null, () => ({ deck: withPictures }));
    return c.redirect(`/edit/${row.slug}`);
  };
  app.get("/try", tryIt);
  app.get("/try/:template", tryIt);

  /* Guests nobody claimed go after a month, pictures and all. Checked
     daily; the timer does not keep a process alive on its own. */
  const sweep = async () => {
    for (const id of auth.sweepGuests()) await storage.deleteAll(id).catch(() => {});
  };
  setInterval(() => void sweep(), 86_400_000).unref();

  /* A visitor's first screen is a wall, not a form: one of the
     templates, walked live, with a few words over it and one thing to
     do. Its pictures are the checkout's own under /demo, so the paths
     resolve from the root with no asset base at all. */
  const landing = async (/** @type {Context} */ c) => {
    const deck = await readExample(config.root, "product-demo");
    const html = renderShell(await shell(c.req.path), {
      payload: {
        deck,
        id: "welcome",
        slug: "welcome",
        title: deck.title,
        rev: 0,
        editable: false,
        assetBase: "",
        url: `${config.baseUrl}/`,
        visibility: "public",
        published: null,
        dirty: false,
        landing: true,
      },
      title: "Storyboard — a slide deck presented as a gallery wall",
      description: "Index cards pinned to plaster, headings painted on, walked with the arrow keys. Make your own and publish it at a link.",
      canonical: `${config.baseUrl}/`,
      rootAssets: !config.dev,
      extra: landingAside({ signedIn: !!userOf(c) && !isGuest(userOf(c)), guests: config.signup === "open" }),
    });
    return c.html(html, 200, { "cache-control": "public, max-age=300", vary: "Cookie" });
  };
  app.get("/", (c) => (userOf(c) ? home(c) : landing(c)));
  app.get("/home", (c) => home(c));
  app.get("/welcome", landing);

  app.get("/developers", (c) => {
    const user = userOf(c);
    if (!user) return c.redirect("/signin?next=%2Fdevelopers");
    return c.html(developersPage({ user, baseUrl: config.baseUrl, tokens: auth.tokens(user.id) }));
  });

  /* ---- the wall, published and draft ---- */

  /** What src/deck/source.ts reads. */
  const payloadFor = (
    /** @type {import("./decks.js").DeckRow} */ row,
    /** @type {Deck} */ deck,
    /** @type {{ editable: boolean, owner: boolean, guest?: boolean }} */ o,
  ) => {
    const d = decks.describe(row);
    return {
      guest: !!o.guest,
      deck,
      id: d.id,
      slug: d.slug,
      title: d.title,
      rev: o.editable ? d.rev : row.published_rev,
      editable: o.editable,
      assetBase: d.assetBase,
      url: d.url,
      editUrl: o.owner && !o.editable ? d.editUrl : undefined,
      visibility: d.visibility,
      published: d.published,
      dirty: o.editable ? d.dirty : false,
    };
  };

  app.get("/edit/:slug", async (c) => {
    const user = userOf(c);
    if (!user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.path)}`);
    const row = decks.bySlug(param(c, "slug"));
    if (!row || row.owner_id !== user.id) throw new HttpError(404, "There is no deck of yours at this address.");
    const deck = /** @type {Deck} */ (JSON.parse(row.draft));
    const html = renderShell(await shell(c.req.path), {
      payload: payloadFor(row, deck, { editable: true, owner: true, guest: isGuest(user) }),
      title: `${row.title} — editing`,
      noindex: true,
      rootAssets: !config.dev,
    });
    return c.html(html, 200, { "cache-control": "no-store" });
  });

  /** The published copy a viewer may see, or a reason not. */
  const published = (/** @type {Context} */ c) => {
    const row = decks.bySlug(param(c, "slug"));
    const user = userOf(c);
    const owner = !!(user && row && row.owner_id === user.id);
    if (!row || (!row.published && !owner)) throw new HttpError(404, "There is no deck at this address.");
    if (row.visibility === "private" && !owner) throw new HttpError(404, "There is no deck at this address.");
    return { row, owner, user };
  };

  app.get("/d/:slug", async (c) => {
    const { row, owner, user } = published(c);
    if (!row.published)
      return c.html(
        messagePage("Not published yet", "This deck has not been published. Open the editor and press Publish.", {
          user,
          back: `/edit/${row.slug}`,
        }),
        404,
      );
    const etag = `"${row.id}-${row.published_rev}${owner ? "-o" : ""}"`;
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    const deck = /** @type {Deck} */ (JSON.parse(row.published));
    const d = decks.describe(row);
    const html = renderShell(await shell(c.req.path), {
      payload: payloadFor(row, deck, { editable: false, owner }),
      title: row.title,
      description: deck.subtitle,
      canonical: d.url,
      noindex: row.visibility !== "public",
      rootAssets: !config.dev,
    });
    return c.html(html, 200, {
      etag,
      "cache-control": owner ? "private, no-cache" : "public, max-age=0, must-revalidate",
      vary: "Cookie",
    });
  });

  app.get("/d/:slug/deck.json", (c) => {
    const { row } = published(c);
    if (!row.published) throw new HttpError(404, "not published yet");
    return c.body(row.published, 200, {
      "content-type": "application/json",
      etag: `"${row.id}-${row.published_rev}"`,
      "cache-control": "public, max-age=0, must-revalidate",
    });
  });

  app.get("/a/:id/:file", async (c) => {
    const row = decks.get(param(c, "id"));
    const user = userOf(c);
    if (!row) throw new HttpError(404, "no such picture");
    if (row.visibility === "private" && row.owner_id !== user?.id) throw new HttpError(404, "no such picture");
    const got = await decks.picture(row.id, param(c, "file"));
    if (!got) throw new HttpError(404, "no such picture");
    return c.body(/** @type {any} */ (got.stream), 200, {
      "content-type": got.mime,
      "content-length": String(got.size),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
  });

  /* ------------------------------------------------------------------
     The API: what the panel calls
  ------------------------------------------------------------------ */

  const api = new Hono();

  api.use("*", async (c, next) => {
    if (!userOf(c)) throw new HttpError(401, "sign in first");
    await next();
  });

  /** The deck in the path, if it is the caller's. Anyone else's is not there. */
  const own = (/** @type {Context} */ c) => {
    const row = decks.must(param(c, "id"));
    if (row.owner_id !== /** @type {import("./auth.js").User} */ (userOf(c)).id)
      throw new HttpError(404, "no such deck");
    return row;
  };

  const small = bodyLimit({ maxSize: 512 * 1024, onError: tooMuch });
  const large = bodyLimit({ maxSize: Math.round(config.quota.pictureBytes * 1.05), onError: tooMuch });

  api.get("/", (c) => c.json({ decks: decks.list(/** @type {any} */ (userOf(c)).id) }));

  api.post("/", small, async (c) => {
    const user = /** @type {import("./auth.js").User} */ (userOf(c));
    const body = await bodyOf(c);
    const title = String(body.title ?? "").trim();
    const from = String(body.from ?? "blank");
    try {
      if (!title) throw new HttpError(400, "a deck needs a title");
      let deck = /** @type {Deck} */ ({ title, slides: [] });
      if (from !== "blank") {
        if (!isExample(config.root, from)) throw new HttpError(400, `no example called ${from}`);
        deck = { ...(await readExample(config.root, from)), title };
      }
      const row = decks.create(user.id, { title, deck });
      if (from !== "blank") {
        // the example's pictures become the deck's own, through the same door as an upload
        const withPictures = await importPictures(deck, publicReader(config.root), (data) =>
          decks.addPicture(row.id, data),
        );
        decks.applyOp(row.id, null, () => ({ deck: withPictures }));
      }
      const d = decks.describe(decks.must(row.id));
      if (isForm(c)) return c.redirect(d.editUrl);
      return c.json({ ok: true, id: d.id, slug: d.slug, url: d.url, editUrl: d.editUrl, rev: d.rev }, 201);
    } catch (err) {
      if (isForm(c) && err instanceof HttpError) return home(c, { error: err.message });
      throw err;
    }
  });

  api.get("/:id", (c) => {
    const row = own(c);
    return c.json({ ...decks.describe(row), deck: JSON.parse(row.draft) });
  });

  api.patch("/:id", small, async (c) => {
    const row = own(c);
    const body = await bodyOf(c);
    const next = decks.settings(row.id, {
      title: body.title == null ? undefined : String(body.title),
      slug: body.slug == null ? undefined : String(body.slug),
      visibility: body.visibility == null ? undefined : String(body.visibility),
    });
    const d = decks.describe(next);
    return c.json({ ok: true, slug: d.slug, url: d.url, visibility: d.visibility, title: d.title, rev: d.rev, dirty: d.dirty });
  });

  const destroy = async (/** @type {Context} */ c) => {
    const row = own(c);
    await decks.remove(row.id);
    return isForm(c) ? c.redirect(homePath) : c.json({ ok: true });
  };
  api.delete("/:id", destroy);
  api.post("/:id/delete", destroy);

  /* ---- the six the plugin answers, on a document ---- */

  const save = async (/** @type {Context} */ c) => {
    const row = own(c);
    const body = await bodyOf(c);
    const n = whole(param(c, "n"), "the slide number");
    if (body.slide == null) throw new HttpError(400, "no slide to write");
    const out = decks.applyOp(row.id, revOf(body), (deck) => ({
      deck: replaceSlide(deck, n, /** @type {Slide} */ (body.slide)),
    }));
    return c.json({ ok: true, ...out, note: `slide ${n} written` });
  };
  api.put("/:id/slides/:n", small, save);
  api.post("/:id/slides/:n", small, save); // a beacon can only POST

  api.post("/:id/slides", small, async (c) => {
    const row = own(c);
    const body = await bodyOf(c);
    const after = whole(body.after ?? 0, "after");
    if (body.slide == null) throw new HttpError(400, "no slide to add");
    const out = decks.applyOp(row.id, revOf(body), (deck) => {
      /* The slide being stood on may carry edits that were never
         written. They come along in `current`, in the same write. */
      let base = deck;
      if (body.current != null && after > 0)
        base = replaceSlide(base, after, /** @type {Slide} */ (body.current));
      return { deck: insertSlide(base, after, /** @type {Slide} */ (body.slide)) };
    });
    return c.json({
      ok: true,
      ...out,
      note: after === 0 ? "slide added at the front" : `slide added after ${after}`,
    });
  });

  api.delete("/:id/slides/:n", small, async (c) => {
    const row = own(c);
    const body = await bodyOf(c);
    const n = whole(param(c, "n"), "the slide number");
    const out = decks.applyOp(row.id, revOf(body), (deck) => removeSlide(deck, n));
    return c.json({ ok: true, ...out, note: `slide ${n} removed` });
  });

  api.post("/:id/slides/:n/move", small, async (c) => {
    const row = own(c);
    const body = await bodyOf(c);
    const from = whole(param(c, "n"), "the slide number");
    const to = whole(body.to, "to");
    const out = decks.applyOp(row.id, revOf(body), (deck) => ({ deck: moveSlide(deck, from, to) }));
    return c.json({ ok: true, ...out, note: `slide ${from} moved to ${to}` });
  });

  api.patch("/:id/fields", small, async (c) => {
    const row = own(c);
    const body = await bodyOf(c);
    const set = body.set && typeof body.set === "object" ? body.set : {};
    const out = decks.applyOp(row.id, revOf(body), (deck) => ({ deck: setFields(deck, set) }));
    const keys = Object.keys(set);
    return c.json({ ok: true, ...out, note: keys.length ? `${keys.join(", ")} written` : "nothing to write" });
  });

  /* ---- the whole draft, for a push or an undo ---- */

  api.put("/:id/draft", small, async (c) => {
    const row = own(c);
    const body = await bodyOf(c);
    if (!body.deck || typeof body.deck !== "object") throw new HttpError(400, "no deck");
    const out = decks.applyOp(row.id, revOf(body), () => ({
      deck: { .../** @type {Deck} */ (body.deck), title: /** @type {Deck} */ (body.deck).title || row.title },
    }));
    return c.json({ ok: true, ...out, note: "the draft was replaced" });
  });

  /* ---- publishing ---- */

  api.post("/:id/publish", small, async (c) => {
    const row = own(c);
    // a wall with nobody's name on it is not put at a link; the panel asks for the address first
    if (isGuest(userOf(c))) throw new HttpError(403, "keep this wall with your email first; then it is published");
    const body = await bodyOf(c);
    const out = decks.publish(row.id, revOf(body));
    return c.json({ ok: true, ...out });
  });

  api.post("/:id/discard", small, async (c) => {
    const row = own(c);
    const out = decks.discard(row.id);
    return c.json({ ok: true, ...out, note: "back to what is published" });
  });

  api.get("/:id/versions", (c) => c.json({ versions: decks.versions(own(c).id) }));

  api.post("/:id/versions/:rev/restore", small, async (c) => {
    const row = own(c);
    const rev = whole(param(c, "rev"), "the version");
    const out = decks.restore(row.id, rev);
    return c.json({ ok: true, ...out, note: `version ${rev} is in the draft` });
  });

  api.get("/:id/changes", (c) => c.json({ changes: decks.changes(own(c).id) }));

  /* ---- pictures ---- */

  api.post("/:id/assets", large, async (c) => {
    const row = own(c);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new HttpError(400, "send the picture as a form field called file");
    const out = await decks.addPicture(row.id, Buffer.from(await file.arrayBuffer()));
    return c.json({ ok: true, ...out, note: `${out.width}×${out.height}, kept with the deck` });
  });

  app.route("/api/decks", api);

  /* ---- somebody else's AI, through the same routes (mcp.js) ---- */

  app.post("/api/mcp", small, mcpRoute({ app, config, seenOf }));
  for (const verb of /** @type {const} */ (["get", "delete"]))
    app[verb]("/api/mcp", (c) => c.json({ error: "this speaks MCP over POST" }, 405));

  return app;
}
