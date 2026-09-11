/* Where the editor's writes go.

   The panel edits the wall; something else has to keep what it edits.
   Beside `pnpm dev` that is the deck file, through the plugin in
   tools/deck-editor.js. On a host it is the server, which keeps a deck
   as a JSON document and answers every write with a revision number.
   The panel does not know which: it hands one slide, as data, to
   whichever of these it was given, and reads back a note to show.

   The file store prints the slide as source on its way out, because a
   file holds source — see deck/print.ts. Everything the panel decides
   about *what* to write (which fields, in what order, which defaults
   to leave unsaid) is settled before it gets here. */

import type { Deck, Slide } from "../deck/types.js";
import type { Hosted, Visibility } from "../deck/source.js";
import { printSlide } from "../deck/print.js";

/** One stop, as a store carries it: the slide's data, or — for the
    file store only — its text as the author wrote it, comment and all. */
export type Payload = Slide | string;

export interface Written {
  /** What was done, for the panel's note line. */
  note: string;
  /** How many slides the deck has now. */
  slides?: number;
  /** For `remove`: what was taken out, so an undo can put back exactly that. */
  removed?: Payload;
}

export interface DeckStore {
  readonly kind: "file" | "api";
  /** What the picture zone says becomes of a dropped file. */
  readonly pictureNote: string;
  /** The placeholder for a typed picture path. */
  readonly pictureHint: string;
  save(slide: number, stop: Payload, quiet: boolean): Promise<Written>;
  /** Insert after `after` (0 is the front). `current` re-saves the slide
      being stood on in the same write, so its unsaved edits survive the
      reload that follows. */
  add(after: number, stop: Payload, current?: Payload): Promise<Written>;
  remove(slide: number): Promise<Written>;
  move(from: number, to: number): Promise<Written>;
  /** The deck's own fields — the room it hangs in. A null takes one out. */
  setFields(set: Record<string, string | null>): Promise<Written>;
  /** A picture, kept. Resolves to the `image:` path the card will use. */
  upload(file: File): Promise<string>;
  /** A last save as the page goes, with no answer expected. */
  beacon(slide: number, stop: Payload): void;
}

async function answerOf<T>(res: Response, who: string): Promise<T> {
  const out = await res.json().catch(() => null);
  if (!out) throw new Error(`${who} did not answer (HTTP ${res.status}).`);
  if (!res.ok) throw new Error(out.error || `the server said ${res.status}`);
  return out as T;
}

const sendBeacon = (url: string, body: unknown) =>
  navigator.sendBeacon?.(
    url,
    new Blob([JSON.stringify(body)], { type: "application/json" }),
  );

const base64Of = (file: File) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => bad(r.error);
    r.readAsDataURL(file);
  });

/* ------------------------------------------------------------------
   The deck file, through the dev server
------------------------------------------------------------------ */

interface PluginAnswer {
  ok: true;
  file: string;
  slides: number;
  note: string;
  removed?: string;
}

export class FileStore implements DeckStore {
  readonly kind = "file";
  readonly pictureNote = "It is copied into public/slides/ and named for you.";
  readonly pictureHint = "or a path under public/ — slides/dashboard.png";

  private text = (p: Payload) => (typeof p === "string" ? p : printSlide(p));

  private async post<T = PluginAnswer>(what: string, body: unknown): Promise<T> {
    const res = await fetch(`/__deck/${what}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    /* The dev server's plugin always answers in JSON. Anything else —
       an empty 404, a Vite error page — means the request never reached
       the plugin: usually a server that has been restarted in place
       until it lost its middleware. The fix is to start it again, and
       the message says so rather than leaving the author to guess. */
    const out = await res.json().catch(() => null);
    if (!out)
      throw new Error(
        `the dev server did not answer (HTTP ${res.status}). Stop it and run pnpm dev again.`,
      );
    if (!res.ok) throw new Error(out.error || `the server said ${res.status}`);
    return out as T;
  }

  private done = (a: PluginAnswer): Written => ({
    note: `${a.note} → ${a.file}`,
    slides: a.slides,
    removed: a.removed,
  });

  async save(slide: number, stop: Payload, quiet: boolean) {
    return this.done(await this.post("save", { slide, block: this.text(stop), quiet }));
  }
  async add(after: number, stop: Payload, current?: Payload) {
    return this.done(
      await this.post("add", {
        slide: after,
        block: this.text(stop),
        current: current == null ? undefined : this.text(current),
      }),
    );
  }
  async remove(slide: number) {
    return this.done(await this.post("remove", { slide }));
  }
  async move(from: number, to: number) {
    return this.done(await this.post("move", { slide: from, to }));
  }
  async setFields(set: Record<string, string | null>) {
    return this.done(await this.post("deck", { set, quiet: true }));
  }
  async upload(file: File) {
    const data = await base64Of(file);
    const out = await this.post<{ path: string }>("asset", {
      name: file.name,
      type: file.type,
      data,
    });
    return out.path;
  }
  beacon(slide: number, stop: Payload) {
    sendBeacon("/__deck/save", { slide, block: this.text(stop), quiet: true });
  }
}

/* ------------------------------------------------------------------
   A hosted deck, through its API
------------------------------------------------------------------ */

interface ApiAnswer {
  ok: true;
  rev: number;
  dirty: boolean;
  slides: number;
  note: string;
  removed?: Slide;
}

/** A write made against a revision the server has already moved past. */
export class StaleError extends Error {
  override name = "StaleError";
}

export interface Version {
  rev: number;
  at: string;
  note: string;
}

/** What differs between the draft and what is published. */
export interface Changes {
  added: number;
  removed: number;
  changed: number;
  /** Deck fields that differ: "room", "title"… */
  fields: string[];
}

export class ApiStore implements DeckStore {
  readonly kind = "api";
  readonly pictureNote = "It is uploaded, sized for the wall, and kept with the deck.";
  readonly pictureHint = "or the name of a picture already uploaded";

  readonly id: string;
  /** The draft's revision, as last heard from the server. Every write carries it. */
  rev: number;
  dirty: boolean;
  published: Hosted["published"];
  slug: string;
  title: string;
  url: string;
  visibility: Visibility;
  /** No address yet: the wall is a guest's until an email claims it. */
  readonly guest: boolean;
  /** Told after any answer that moved the deck on. The publish bar listens. */
  onChange: (() => void) | null = null;

  constructor(h: Hosted) {
    this.guest = !!h.guest;
    this.id = h.id;
    this.rev = h.rev;
    this.dirty = h.dirty;
    this.published = h.published;
    this.slug = h.slug;
    this.title = h.title;
    this.url = h.url;
    this.visibility = h.visibility;
  }

  private async call<T = ApiAnswer>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`/api/decks/${this.id}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify({ ...body, rev: this.rev }),
    });
    if (res.status === 409) {
      const out = await res.json().catch(() => ({}));
      throw new StaleError(out.error || "This deck changed in another window.");
    }
    const out = await answerOf<T>(res, "the server");
    const a = out as Partial<ApiAnswer>;
    if (typeof a.rev === "number") this.rev = a.rev;
    if (typeof a.dirty === "boolean") this.dirty = a.dirty;
    this.onChange?.();
    return out;
  }

  private done = (a: ApiAnswer): Written => ({
    note: a.note,
    slides: a.slides,
    removed: a.removed,
  });

  async save(slide: number, stop: Payload, quiet: boolean) {
    return this.done(await this.call("PUT", `/slides/${slide}`, { slide: stop, quiet }));
  }
  async add(after: number, stop: Payload, current?: Payload) {
    return this.done(await this.call("POST", "/slides", { after, slide: stop, current }));
  }
  async remove(slide: number) {
    return this.done(await this.call("DELETE", `/slides/${slide}`, {}));
  }
  async move(from: number, to: number) {
    return this.done(await this.call("POST", `/slides/${from}/move`, { to }));
  }
  async setFields(set: Record<string, string | null>) {
    return this.done(await this.call("PATCH", "/fields", { set }));
  }
  async upload(file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch(`/api/decks/${this.id}/assets`, { method: "POST", body: form });
    const out = await answerOf<{ path: string }>(res, "the server");
    return out.path;
  }
  beacon(slide: number, stop: Payload) {
    // a beacon can only POST, so the save route answers to that too
    sendBeacon(`/api/decks/${this.id}/slides/${slide}`, {
      slide: stop,
      rev: this.rev,
      quiet: true,
    });
  }

  /* ---- publishing ---- */

  /** Whether the draft has ever been published. */
  get everPublished() {
    return this.published != null;
  }

  /**
   * A guest keeping their wall: ask for the link that makes it theirs.
   * The link publishes the wall on the way in and lands on it.
   */
  async keep(email: string) {
    const res = await fetch("/api/auth/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, next: `/edit/${this.slug}?publish=1` }),
    });
    return answerOf<{ ok: true; how: "log" | "resend" | "smtp" }>(res, "the server");
  }

  async publish() {
    const out = await this.call<{ publishedRev: number; at: string; url: string }>(
      "POST",
      "/publish",
      {},
    );
    this.published = { rev: out.publishedRev, at: out.at };
    this.url = out.url;
    this.onChange?.();
    return out;
  }

  /** Put the published copy back into the draft. Answers with what the draft was. */
  async discard() {
    return this.call<ApiAnswer & { was: Deck }>("POST", "/discard", {});
  }

  /** Replace the whole draft — an undo of a discard or a restore. */
  async replaceDraft(deck: Deck) {
    return this.done(await this.call("PUT", "/draft", { deck }));
  }

  async versions() {
    const out = await this.call<{ versions: Version[] }>("GET", "/versions");
    return out.versions;
  }

  /** Load a published version into the draft. Touches nothing public. */
  async restore(rev: number) {
    return this.call<ApiAnswer & { was: Deck }>("POST", `/versions/${rev}/restore`, {});
  }

  async changes() {
    const out = await this.call<{ changes: Changes }>("GET", "/changes");
    return out.changes;
  }

  /** The deck's own settings: where it lives and who may see it. */
  async settings(patch: { slug?: string; visibility?: Visibility; title?: string }) {
    const out = await this.call<{ slug: string; url: string; visibility: Visibility; title: string }>(
      "PATCH",
      "",
      patch,
    );
    this.slug = out.slug;
    this.url = out.url;
    this.visibility = out.visibility;
    this.title = out.title;
    this.onChange?.();
    return out;
  }
}
