/* Publishing, from the panel.

   Beside `pnpm dev` a slide that was saved was published: the file is
   the deck. On a host a saved slide is a draft, and nobody sees it
   until the author says so. That is the whole of what this module
   adds — one word under the panel's header saying which the wall is
   showing, and one sheet where a deck is put at its link.

   Saving stays automatic. Publishing never is. */

import type { Deck } from "../deck/types.js";
import type { Visibility } from "../deck/source.js";
import { StaleError, type ApiStore, type Changes, type Version } from "./store.js";

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* "3 min ago", the way a header can afford to say it. */
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const VISIBILITY: [Visibility, string, string][] = [
  ["public", "Public", "Anyone with the link, and search engines."],
  ["unlisted", "Unlisted", "Anyone with the link. Search engines are asked not to."],
  ["private", "Private", "Only you, signed in — for a deck rehearsed but not yet shown."],
];

/* ------------------------------------------------------------------
   The bar under the header
------------------------------------------------------------------ */

/**
 * The second status word, and the way to the sheet. Listens to the
 * store, so it is never a write behind.
 */
export function initPublish(store: ApiStore, openSheet: () => void): HTMLElement {
  const bar = h("div", "ed-pub");
  const word = h("span", "ed-pub-state");
  const go = h("button", "ed-pub-go", "Publish…");
  go.type = "button";
  go.title = "Put this deck at its link";
  go.addEventListener("click", openSheet);
  bar.append(word, go);

  const refresh = () => {
    const p = store.published;
    word.textContent = store.guest
      ? "Yours for a week"
      : !p
        ? "Never published"
        : store.dirty
          ? "Unpublished changes"
          : `Published ${ago(p.at)}`;
    word.classList.toggle("dirty", !p || store.dirty);
    word.title = store.guest
      ? "A guest's wall: give an email to keep it"
      : p
        ? `Published version ${p.rev}`
        : "Nobody can see this deck yet";
    go.textContent = store.guest ? "Keep it…" : "Publish…";
  };
  const was = store.onChange;
  store.onChange = () => {
    was?.();
    refresh();
  };
  refresh();
  return bar;
}

/* ------------------------------------------------------------------
   The sheet
------------------------------------------------------------------ */

export interface PublishContext {
  store: ApiStore;
  body: HTMLElement;
  foot: HTMLElement;
  setHead(title: string, canGoBack: boolean): void;
  tell(msg: string, bad?: boolean): void;
  button(label: string, cls: string, title: string, go: () => void): HTMLButtonElement;
  section(id: string, title: string, hint?: string): HTMLDetailsElement;
  /** Back to the slide. */
  close(): void;
  /** The whole draft was replaced; rebuild the page, offering the old one back. */
  replaced(label: string, was: Deck): void;
  stale(err: Error): void;
}

const describe = (c: Changes): string => {
  const parts: string[] = [];
  if (c.changed) parts.push(`${c.changed} slide${c.changed > 1 ? "s" : ""} changed`);
  if (c.added) parts.push(`${c.added} added`);
  if (c.removed) parts.push(`${c.removed} removed`);
  const slides = parts.join(", ");
  const fields = c.fields.length ? `${c.fields.join(", ")} changed` : "";
  return [slides, fields].filter(Boolean).join(" · ") || "Nothing has changed since the last publish.";
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export function renderPublish(ctx: PublishContext) {
  const { store, body, foot } = ctx;
  if (store.guest) return renderKeep(ctx);
  const first = !store.everPublished;
  ctx.setHead(first ? "Publish for the first time" : "Publish", true);

  const fail = (what: string, err: unknown) => {
    if (err instanceof StaleError) ctx.stale(err);
    else ctx.tell(`${what}: ${err instanceof Error ? err.message : err}`, true);
  };

  /* ---- the address ---- */
  const origin = location.origin;
  let slug = store.slug;
  let visibility: Visibility = store.visibility;

  const where = h("div", "ed-f");
  where.append(h("label", "", "Address"));
  if (first) {
    const row = h("div", "ed-link");
    row.append(h("span", "ed-link-pre", `${origin}/d/`));
    const input = h("input");
    input.type = "text";
    input.value = slug;
    input.spellcheck = false;
    input.placeholder = slugOf(store.title) || "my-wall";
    input.addEventListener("input", () => {
      slug = slugOf(input.value) || slugOf(store.title);
      publish.disabled = !SLUG.test(slug);
    });
    row.append(input);
    where.append(row, h("p", "ed-hint", "Letters, digits and dashes. It can be changed later, but a link already shared stops working when it is."));
  } else {
    const row = h("div", "ed-link");
    const input = h("input");
    input.type = "text";
    input.readOnly = true;
    input.value = store.url;
    input.addEventListener("focus", () => input.select());
    row.append(input);
    row.append(
      ctx.button("Copy", "ed-mini", "Copy the link", () => {
        navigator.clipboard
          ?.writeText(store.url)
          .then(() => ctx.tell("Link copied"))
          .catch(() => ctx.tell(store.url));
      }),
    );
    const view = h("a", "ed-mini", "View");
    view.href = store.url;
    view.target = "_blank";
    view.rel = "noopener";
    view.title = "Open the published deck in a new tab";
    row.append(view);
    where.append(row);
  }
  body.append(where);

  /* ---- who may see it ---- */
  const who = h("div", "ed-f");
  who.append(h("label", "", "Who can see it"));
  const seg = h("div", "ed-seg");
  const blurb = h("p", "ed-hint", VISIBILITY.find((v) => v[0] === visibility)?.[2] ?? "");
  for (const [id, label, note] of VISIBILITY) {
    const b = h("button", id === visibility ? "on" : "", label);
    b.type = "button";
    b.addEventListener("click", async () => {
      visibility = id;
      for (const x of seg.children) x.classList.toggle("on", x === b);
      blurb.textContent = note;
      // a setting, not a publish: it takes effect on the link right away
      if (!first) {
        try {
          await store.settings({ visibility });
          ctx.tell(`Now ${label.toLowerCase()}`);
        } catch (err) {
          fail("Could not change that", err);
        }
      }
    });
    seg.append(b);
  }
  who.append(seg, blurb);
  body.append(who);

  /* ---- what would go out ---- */
  const what = h("p", "ed-pub-changes", first ? "Counting the slides…" : "Looking at what changed…");
  body.append(what);
  store
    .changes()
    .then((c) => {
      what.textContent = first
        ? `${c.added} slide${c.added === 1 ? "" : "s"} go${c.added === 1 ? "es" : ""} to the link above.`
        : describe(c);
    })
    .catch(() => (what.textContent = ""));

  /* ---- taking it back ---- */
  if (!first && store.dirty) {
    const back = h("div", "ed-acts ed-gone");
    back.append(
      ctx.button("Discard changes", "ed-danger ed-quiet", "Put the published deck back into the draft — you can undo it", async () => {
        try {
          const out = await store.discard();
          ctx.replaced("Changes discarded — back to what is published", out.was);
        } catch (err) {
          fail("Could not discard", err);
        }
      }),
    );
    body.append(back);
  }

  /* ---- what has gone out before ---- */
  if (!first) {
    const hist = ctx.section("history", "History", `version ${store.published?.rev ?? ""}`);
    const list = h("ol", "ed-versions");
    list.append(h("li", "ed-hint", "Loading…"));
    hist.append(list);
    body.append(hist);
    store
      .versions()
      .then((vs: Version[]) => {
        list.replaceChildren();
        for (const v of vs) {
          const row = h("li");
          const now = v.rev === store.published?.rev;
          row.append(h("b", "", `v${v.rev}`), h("span", "", `${ago(v.at)}${now ? " · live" : ""}`));
          if (v.note) row.append(h("i", "", v.note));
          row.append(
            ctx.button("Restore", "ed-mini", "Load this version into the draft. Nothing public changes until you publish.", async () => {
              try {
                const out = await store.restore(v.rev);
                ctx.replaced(`Version ${v.rev} restored into the draft`, out.was);
              } catch (err) {
                fail("Could not restore", err);
              }
            }),
          );
          list.append(row);
        }
        if (!vs.length) list.append(h("li", "ed-hint", "Nothing yet."));
      })
      .catch(() => list.replaceChildren(h("li", "ed-hint", "Could not load the history.")));
  }

  /* ---- the button ---- */
  const publish = ctx.button(first ? "Publish" : "Publish changes", "ed-go", "Put the draft at the link", async () => {
    publish.disabled = true;
    try {
      if (first) await store.settings({ slug, visibility });
      const out = await store.publish();
      navigator.clipboard?.writeText(out.url).catch(() => {});
      // back to the slide first: closing redraws the panel, note line and all
      ctx.close();
      ctx.tell("Published · link copied");
    } catch (err) {
      publish.disabled = false;
      fail("Could not publish", err);
    }
  });
  if (!first && !store.dirty) {
    publish.disabled = true;
    publish.title = "Everything is already published";
  }
  foot.append(ctx.button("Cancel", "", "Back to the slide", ctx.close), publish);
}

/* A guest's Publish: the wall is written, and this is the moment an
   address is worth giving. One field. The link that comes back makes
   the wall theirs, publishes it, and lands on it. */
function renderKeep(ctx: PublishContext) {
  const { store, body, foot } = ctx;
  ctx.setHead("Keep this wall", true);

  body.append(
    h("p", "ed-pub-changes", "Your wall is written. To put it at a link, and keep it past this week, it needs an address to belong to."),
  );
  const field = h("div", "ed-f");
  field.append(h("label", "", "Your email"));
  const input = h("input");
  input.type = "email";
  input.placeholder = "you@example.com";
  input.autocomplete = "email";
  field.append(input);
  body.append(field);
  body.append(
    h("p", "ed-hint", "A link comes back — no password. Opening it publishes the wall and shows you the link to share. Nothing is sent anywhere else."),
  );
  const sent = h("p", "ed-pub-changes");
  sent.hidden = true;
  body.append(sent);

  const go = ctx.button("Send me the link", "ed-go", "Keep the wall, and publish it", async () => {
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
      ctx.tell("That does not look like an email address", true);
      input.focus();
      return;
    }
    go.disabled = true;
    try {
      const out = await store.keep(email);
      sent.hidden = false;
      sent.textContent =
        out.how === "log"
          ? "The link is in the server's log (no mail is set up on this wall). Open it, and the wall is published."
          : `Sent to ${email}. Open the link, and the wall is published.`;
      ctx.tell("");
    } catch (err) {
      go.disabled = false;
      ctx.tell(`Could not send: ${err instanceof Error ? err.message : err}`, true);
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go.click();
  });
  foot.append(ctx.button("Not yet", "", "Back to the slide", ctx.close), go);
  setTimeout(() => input.focus(), 50);
}
