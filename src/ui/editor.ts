/* The wall, edited from inside itself.

   A deck is a composition, not a form: how wide a card is, how far it
   leans, what sits next to what. None of that can be judged from a
   field — it has to be looked at. So the editor opens beside the wall
   it edits and redraws the card as the words are typed, rather than
   asking the author to save, reload, and see. Cards are dragged into
   place with the pointer, because the numbers that describe a position
   are miserable to guess at and obvious to point at.

   It edits the slide the deck is standing at, not a list of every card,
   because that is the one the camera is already pointed at.

   Three things the panel is built around:

   - The kind of a card is asked *before* it exists. "+ Add" asks what
     is being added — a note, a photo, a heading — and where, and only
     then writes it. A card is never a note that has to be turned into
     something else afterwards.
   - Fields are grouped by where they show. What a card draws on the
     wall comes first and differs by kind; what a photo's words do (go
     to the text version) has its own group, named for that. A field
     never implies something the wall will not do.
   - Everything is saved as it is made. Typing is written a moment
     after it stops, a drag when the card is let go — quietly, without
     the page being rebuilt, because the wall already shows it. Only a
     change to the *shape* of the deck (a card or a slide added or
     taken away) is written and read back, so what is on the wall is
     never a guess about what is on disk. Taking something away can be
     undone, for a while.

   Nothing here keeps a copy of the deck: the file — or, on a host, the
   server — is the deck, and this only ever hands it one slide at a
   time, as data, through a store (see ./store.ts). tools/deck-editor.js
   is the file's half of that; the server's is under server/.

   Loaded only where the deck may be edited: beside `pnpm dev`, and on
   a host by the deck's owner. A deck being shown never loads it. */

import "../styles/editor.css";
import { THREE } from "../vendor.js";
import { PAPERS } from "../textures/papers.js";
import { rebuildCard } from "../scene/card.js";
import { camera, canvas, fitCamera } from "../scene/stage.js";
import { spaceOutCards } from "../deck/layout.js";
import {
  beats,
  storyAt,
  storyCards,
  storyRefresh,
  storyReframe,
  storyGoToSlide,
  onStoryMove,
  hideHint,
} from "../deck/story.js";
import {
  cardDefaults,
  sizeCards,
  ATTACHES,
  DOODLES,
  FONTS,
} from "../deck/schema.js";
import { imageFor, loadImages } from "../deck/images.js";
import { typing, claimPointer } from "./controls.js";
import { cards } from "../scene/card.js";
import { buildRoom } from "../scene/room.js";
import { lightRoom } from "../scene/stage.js";
import {
  ROOMS,
  FLOORS,
  LIGHTS,
  roomNamed,
  resolveRoom,
  naturalKnobs,
  currentRoom,
  setRoom,
  applyChrome,
  type Room,
  type RoomName,
  type Knobs,
} from "../rooms.js";
import type { Card, CardType, Deck, Promise_, Slide } from "../deck/types.js";
import type { CardGroup } from "../scene/card.js";
import { currentSource } from "../deck/source.js";
import {
  ApiStore,
  FileStore,
  StaleError,
  type DeckStore,
  type Payload,
} from "./store.js";
import { initPublish, renderPublish } from "./publish.js";
import { initInPlace, type InPlaceKey } from "./inplace.js";
import { cardAt } from "../scene/pick.js";

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

const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------
   The three kinds, as an author meets them
------------------------------------------------------------------ */

/* What the panel calls a kind is what the wall shows, not what the
   engine calls it: a "heading" is painted on the plaster and the engine
   knows it as a mural. The word an author would use wins here. */
type Kind = "note" | "photo" | "heading";

interface KindInfo {
  kind: Kind;
  type: CardType;
  name: string;
  blurb: string;
}

const KINDS: readonly KindInfo[] = [
  {
    kind: "note",
    type: "note",
    name: "Note",
    blurb: "Words on paper, pinned to the wall.",
  },
  {
    kind: "photo",
    type: "photo",
    name: "Photo",
    blurb: "A picture, matted like a print. Shows only the picture.",
  },
  {
    kind: "heading",
    type: "mural",
    name: "Heading",
    blurb: "Painted straight onto the plaster. Opens a chapter.",
  },
];

const kindOf = (t: CardType): KindInfo =>
  KINDS.find((k) => k.type === t) ?? KINDS[0]!;
const kindNamed = (k: Kind): KindInfo =>
  KINDS.find((i) => i.kind === k) ?? KINDS[0]!;

/* A little picture of the kind — a curl of paper, a matted print, a
   painted letter — so the three are told apart at a glance rather than
   by reading. Drawn in CSS; see .ed-sw in editor.css. */
function swatch(kind: Kind, small = false) {
  const s = h("span", `ed-sw ed-sw-${kind}${small ? " ed-sw-s" : ""}`);
  s.setAttribute("aria-hidden", "true");
  s.append(h("i", "", kind === "heading" ? "Aa" : ""));
  return s;
}

/* ------------------------------------------------------------------
   What a card offers to be edited
------------------------------------------------------------------ */

interface Field {
  key: string;
  label: string;
  kind: "line" | "para" | "list" | "pick" | "num" | "flag" | "paint" | "table";
  options?: readonly string[];
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  /* Read and written on the wall rather than on the card. After the
     separation pass a card is not where its own x and y say it is, and
     the field has to show where it actually hangs. */
  onWall?: "x" | "y";
}

const F = {
  title: { key: "title", label: "Title", kind: "line" },
  text: { key: "text", label: "Text", kind: "para" },
  bullets: { key: "bullets", label: "Bullets", kind: "list", placeholder: "One per line" },
  table: { key: "table", label: "Table", kind: "table" },
  foot: { key: "foot", label: "Foot", kind: "line", placeholder: "A faint line at the bottom" },
  say: { key: "say", label: "What you say", kind: "para", placeholder: "Open on why this mattered, then land on the number." },
  image: { key: "image", label: "Picture", kind: "line", placeholder: "slides/dashboard.png — under public/" },
  caption: { key: "caption", label: "Caption", kind: "line", placeholder: "A line under the picture, on the mat" },
  paper: { key: "paper", label: "Paper", kind: "pick", options: Object.keys(PAPERS) },
  attach: { key: "attach", label: "Pinned with", kind: "pick", options: ATTACHES },
  doodle: { key: "doodle", label: "Doodle", kind: "pick", options: DOODLES },
  font: { key: "font", label: "Lettering", kind: "pick", options: FONTS },
  paint: { key: "paint", label: "Paint", kind: "paint" },
  rule: { key: "rule", label: "Rule under it", kind: "flag" },
  ink: { key: "ink", label: "Marker, not brush", kind: "flag" },
  w: { key: "w", label: "Width", kind: "num", step: 0.25, min: 1, max: 30 },
  rot: { key: "rot", label: "Tilt", kind: "num", step: 0.5, min: -20, max: 20 },
  x: { key: "x", label: "Across", kind: "num", step: 0.25, onWall: "x" },
  y: { key: "y", label: "Up", kind: "num", step: 0.25, onWall: "y" },
} satisfies Record<string, Field>;

/* A heading's title is the heading, and its text the line under it. */
const HEADING_TITLE: Field = { ...F.title, label: "Heading" };
const HEADING_TEXT: Field = { ...F.text, label: "Line under it" };

/* Which fields go in which group, by kind. This is the panel's whole
   argument: what the wall draws comes first, and a field is only ever
   offered under the name of the place it shows. */
function onTheWall(t: CardType): Field[] {
  if (t === "photo") return [F.image, F.caption];
  if (t === "mural") return [HEADING_TITLE, HEADING_TEXT, F.paint, F.rule, F.ink];
  return [F.title, F.text, F.bullets, F.table, F.foot];
}
const inTheText = (t: CardType): Field[] =>
  t === "photo" ? [F.title, F.text, F.bullets, F.table, F.foot] : [];
function look(t: CardType): Field[] {
  if (t === "photo") return [F.paper, F.attach];
  if (t === "mural") return [F.font];
  return [F.paper, F.attach, F.doodle, F.font];
}
const PLACEMENT: Field[] = [F.w, F.rot, F.x, F.y];

/* ------------------------------------------------------------------
   Reading and writing one field
------------------------------------------------------------------ */

type Bag = Record<string, unknown>;

/* A table, as one textarea: a row per line, cells parted by `|`. A line
   of dashes under the first row makes that row the header — the way a
   Markdown table does it, which is the one people already know. */
type TableLike = { head?: string[]; rows: string[][] };

function tableToText(t: TableLike | undefined): string {
  if (!t) return "";
  const line = (cells: string[]) => cells.join(" | ");
  const out: string[] = [];
  if (t.head) out.push(line(t.head), "---");
  for (const r of t.rows) out.push(line(r));
  return out.join("\n");
}

function textToTable(text: string): TableLike | undefined {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return undefined;
  const cells = (l: string) => l.split("|").map((c) => c.trim());
  let head: string[] | undefined;
  if (lines.length > 1 && /^-{3,}$/.test(lines[1] ?? "")) {
    head = cells(lines[0] ?? "");
    lines.splice(0, 2);
  }
  const rows = lines.map(cells);
  if (!head && !rows.length) return undefined;
  return head ? { head, rows } : { rows };
}

const groupOf = (p: Promise_): CardGroup | undefined =>
  storyCards().find((g) => g.userData.p === p);

/** The cards of a slide, wherever the deck is standing. */
const cardsOf = (slide: number): Promise_[] =>
  (beats.find((b) => !b.overview && b.slide === slide)?._gs ?? []).map(
    (g) => g.userData.p,
  );

function read(p: Promise_, f: Field) {
  if (f.onWall) return round(groupOf(p)?.position[f.onWall] ?? p[f.onWall] ?? 0);
  return (p as unknown as Bag)[f.key];
}

/* An empty field means "the author said nothing", not "the author said
   the empty string" — the difference matters, because the schema fills
   in what was left unsaid and would happily draw an empty heading. */
function write(p: Promise_, f: Field, value: unknown) {
  if (f.onWall) {
    pin(p, f.onWall, Number(value));
    return;
  }
  const bag = p as unknown as Bag;
  if (value === "" || value == null || (Array.isArray(value) && !value.length))
    delete bag[f.key];
  else bag[f.key] = value;

  // a value typed in is a value chosen; the engine stops guessing it
  if (f.key === "w") p.autoWidth = false;
  if (f.key === "rot") p.autoRot = false;
}

/** Put a card at a spot and remember that somebody meant it to be there. */
function pin(p: Promise_, axis: "x" | "y", to: number) {
  if (!Number.isFinite(to)) return;
  unsaved.add(p.slide);
  p[axis] = to;
  if (axis === "x") p.autoX = false;
  else p.autoY = false;
  const g = groupOf(p);
  if (g) g.position[axis] = to;
  syncStatus();
}

/* Changing what kind of card this is changes which fields it has.
   Paint sits in the plaster at a fixed band, so a mural carries a ratio
   and paper does not — leaving a stale one behind would freeze a note
   at a mural's proportions no matter what was written on it. */
function retype(p: Promise_, t: CardType) {
  const was = p.type;
  if (was === t) return;
  p.type = t;
  const d = cardDefaults(t);
  if (t === "mural") {
    p.ratio = d.ratio;
    p.rule = p.rule ?? true;
    p.ink = p.ink ?? true;
    delete (p as unknown as Bag).doodle;
    delete (p as unknown as Bag).image;
  } else if (was === "mural") {
    delete p.ratio; // measured from its own words again
  }
  if (p.autoWidth) p.w = d.w;
  p.attach = d.attach;
  p.font = d.font;
}

/* ------------------------------------------------------------------
   The slide, as data
------------------------------------------------------------------ */

type Bag_ = Record<string, unknown>;

/* One card as an author would have written it.

   Only what was actually chosen: a value equal to the default this kind
   of card already gets is left out, and so is anything the engine
   derived rather than the author pinning. A deck that spells out the
   tilt of every card is a deck whose seed no longer means anything.

   The keys go in the order the file should read them, because the
   printer keeps that order. */
function cardData(p: Promise_): Card {
  const d = cardDefaults(p.type);
  const c: Bag_ = {};

  if (p.type === "mural") {
    // `mural: "Heading"` is the shorthand, and carries the title with it
    c.mural = p.title ? p.title : true;
    if (p.text) c.sub = p.text;
  } else {
    // an `image:` already says photo; anything else needs saying
    if (p.type === "photo" && !p.image) c.type = "photo";
    if (p.title) c.title = p.title;
    if (p.text) c.text = p.text;
  }

  if (p.image) c.image = p.image;
  if (p.caption) c.caption = p.caption;
  if (p.bullets?.length) c.bullets = p.bullets;
  if (p.foot) c.foot = p.foot;
  if (p.table) c.table = p.table;
  // the narration is content, not layout: it is always written back
  if (p.say) c.say = p.say;

  for (const k of ["paper", "attach", "font", "doodle"] as const) {
    const v = p[k];
    if (v != null && v !== (d as unknown as Bag_)[k]) c[k] = String(v);
  }
  if (p.pinColor != null && p.pinColor !== d.pinColor) c.pinColor = p.pinColor;
  if (p.type === "mural") {
    if (p.paint) c.paint = p.paint;
    if (p.rule === false) c.rule = false;
    if (p.ink === false) c.ink = false;
  }

  if (!p.autoWidth) c.w = round(p.w);
  /* A note's ratio is measured from its words and never lands on the
     card, and a mural's comes from the defaults — so one that is here
     and is not the default is one the author pinned. */
  if (p.ratio != null && p.ratio !== (d as unknown as Bag_).ratio)
    c.ratio = round(p.ratio);
  if (!p.autoRot) c.rot = round(p.rot);
  if (!p.autoX && p.x != null) c.x = round(p.x);
  if (!p.autoY && p.y != null) c.y = round(p.y);

  return c as unknown as Card;
}

/* A card that does not exist yet, of a given kind. The words are a
   placeholder the author is meant to overwrite — they say what the
   card is, so a wall of fresh cards still reads. */
function newCardData(kind: Kind, path = ""): Card {
  const c: Bag_ = {};
  if (kind === "heading") {
    c.mural = "New heading";
    c.sub = "a smaller line under it";
  } else if (kind === "photo") {
    if (path) c.image = path;
    else c.type = "photo";
    c.title = "New picture";
  } else {
    c.title = "New card";
    c.text = "Say something here.";
  }
  return c as unknown as Card;
}

/* The whole stop, ready to go into `slides`. One card goes straight
   in; several are held together, which is what `notes` is. */
const stopData = (ps: Promise_[]): Slide => {
  const only = ps[0];
  if (ps.length === 1 && only) return cardData(only);
  return { notes: ps.map(cardData) };
};

/* ------------------------------------------------------------------
   Where the writes go
------------------------------------------------------------------ */

/* The file beside `pnpm dev`, or the server on a host. Chosen once, in
   initEditor, from where the deck came. */
let store: DeckStore;

/* Writing on the card itself (see inplace.ts). Its keystrokes land on
   the card exactly as the panel's fields do, so the same save follows;
   the panel's own fields are kept in step as it types. */
const IN_PLACE: Record<InPlaceKey, () => Field> = {
  title: () => F.title,
  text: () => F.text,
  bullets: () => F.bullets,
  caption: () => F.caption,
};
const inplace = initInPlace({
  set(p, key, value) {
    write(p, IN_PLACE[key](), value);
    touched(p);
    mirror(key, value);
  },
  redraw(p) {
    void redraw(p);
  },
  closed() {
    if (open) render();
  },
});

/* The panel's field for what was just typed on the card, if it is
   showing, without rebuilding the panel under a hand that is typing. */
function mirror(key: InPlaceKey, value: string | string[]) {
  if (!body) return;
  const label = IN_PLACE[key]().label;
  for (const row of body.querySelectorAll<HTMLElement>(".ed-f")) {
    if (row.querySelector("label")?.textContent !== label) continue;
    const input = row.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (input) input.value = Array.isArray(value) ? value.join("\n") : value;
  }
}

/* Ask for a picture file: a hidden input, so the button can say what
   it likes. Resolves to nothing if the dialog was dismissed. */
function pickFile(): Promise<File | undefined> {
  return new Promise((done) => {
    const input = h("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.addEventListener("change", () => done(input.files?.[0]));
    input.addEventListener("cancel", () => done(undefined));
    input.click();
  });
}

const isPicture = (f: File | undefined): f is File =>
  !!f && /^image\/(png|jpeg|gif|webp)$/.test(f.type);

/* ------------------------------------------------------------------
   What survives a reload
------------------------------------------------------------------ */

/* A structural edit is written and the page rebuilt from disk. The
   author is still editing, so the panel comes back open, on the card
   they just made, with the chooser set the way they last had it — and
   with the chance to undo what was just taken away. Per tab, and gone
   when the tab is. */
const KEY = {
  open: "storyboard:editor",
  pick: "storyboard:editor:pick",
  kind: "storyboard:editor:kind",
  where: "storyboard:editor:where",
  sections: "storyboard:editor:sections",
  undo: "storyboard:editor:undo",
};
const remember = (k: string, v: string) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* a page that may not store anything still edits */
  }
};
const recall = (k: string): string | null => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------
   The panel
------------------------------------------------------------------ */

let root: HTMLElement | null = null;
let body: HTMLElement | null = null;
let foot: HTMLElement | null = null;
let head: HTMLElement | null = null;
let status: HTMLElement | null = null;
let back: HTMLButtonElement | null = null;
let say: HTMLElement | null = null;
let open = false;
let pick = 0;
let pendingPick: number | null = null;
let view: "slide" | "add" | "list" | "publish" = "slide";
let settle: ReturnType<typeof setTimeout> | undefined;

const stop = () => storyCards().map((g) => g.userData.p);
const slideNow = () => stop()[0]?.slide ?? 0;

function tell(msg: string, bad = false) {
  if (!say) return;
  say.textContent = msg;
  say.classList.toggle("bad", bad);
}

/* ------------------------------------------------------------------
   Saving, as it happens
------------------------------------------------------------------ */

/* Which slides have been edited on the wall and not yet written — the
   moment between a keystroke and the write that follows it. */
const unsaved = new Set<number>();
let saveT: ReturnType<typeof setTimeout> | undefined;
let saving = false;
let failed = false;
/* A structural write is on its way and the page is about to be rebuilt
   from disk. Nothing else may be written in the meantime — a quiet
   save with a slide number from before the reshuffle would land on the
   wrong slide. */
let reloading = false;

/* The one word in the header that says whether the wall and the file
   agree. It is updated by every edit, not only by a render, so it is
   never a keystroke behind. */
function syncStatus() {
  if (!status) return;
  const dirty = unsaved.has(slideNow());
  status.textContent = saving
    ? "Saving…"
    : failed
      ? "Not saved"
      : dirty
        ? "Unsaved"
        : "Saved";
  status.classList.toggle("dirty", dirty || failed);
  status.classList.toggle("busy", saving);
}

/* Written a moment after the last change, not on every keystroke: a
   word is typed in a burst, and the file need only see the word. */
function scheduleSave(slide: number, delay = 700) {
  if (reloading) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => void saveQuiet(slide), delay);
}

/* Write one slide as the wall now holds it, without a reload: the
   server marks the write as its own, so the page is not rebuilt over a
   wall that already shows exactly what was written. */
async function saveQuiet(slide: number) {
  if (reloading) return;
  const ps = cardsOf(slide);
  if (!ps.length) return;
  saving = true;
  syncStatus();
  try {
    await store.save(slide, stopData(ps), true);
    unsaved.delete(slide);
    failed = false;
    tell("");
  } catch (err) {
    failed = true;
    if (err instanceof StaleError) stale(err);
    else tell(`Could not save: ${err instanceof Error ? err.message : err}`, true);
  }
  saving = false;
  syncStatus();
}

/* A write against a revision the server no longer holds: another
   window has moved the deck on. Nothing on this wall can be trusted
   over what is there, so the page is rebuilt from it — and says so
   first, because the last few keystrokes go with it. */
function stale(err: Error) {
  reloading = true;
  clearTimeout(saveT);
  tell(`${err.message} Reloading…`, true);
  setTimeout(() => location.reload(), 1500);
}

/** Write what is pending right now. `⌘S`. */
function saveNow() {
  clearTimeout(saveT);
  const slide = slideNow();
  if (slide) void saveQuiet(slide);
}

/* Redraw the card, then re-link the slides to it, then write it.

   The camera is deliberately left alone until the typing settles: a
   card grows as words are added, and re-aiming on every keystroke makes
   the shot creep away under the hands of whoever is writing. */
function touched(p: Promise_) {
  unsaved.add(p.slide);
  syncStatus();
  void redraw(p).then(() => {
    storyRefresh();
    clearTimeout(settle);
    settle = setTimeout(() => storyRefresh(true), 500);
  });
  scheduleSave(p.slide);
}

/* A photo has to have its picture back before it can be drawn again.

   The source bitmaps are let go once the wall is built (see main.ts),
   because a presented deck is finished with them. A card being edited
   is not: rebuilt without its picture, a photo falls back to a note and
   shows its words instead — which is what the fallback is for, and
   exactly wrong under an author's hands. So the picture is fetched
   back first (the browser still has it) and kept for as long as the
   card is being worked on. A photo the author never sized is sized
   from it, the way the first build did. */
let fetching = 0;
async function redraw(p: Promise_) {
  if (p.image && !imageFor(p.image)) {
    const seq = ++fetching;
    await loadImages([p.image]);
    if (seq !== fetching) return; // a later keystroke is on its way
    if (p.type === "photo" && p.autoWidth) sizeCards([p]);
  }
  rebuildCard(p);
  delete p.userImage;
}

function fieldRow(p: Promise_, f: Field): HTMLElement {
  const row = h("div", "ed-f");
  const value = read(p, f);

  if (f.kind === "flag") {
    const box = h("input");
    box.type = "checkbox";
    box.checked = value !== false;
    box.id = `ed-${f.key}`;
    box.addEventListener("change", () => {
      (p as unknown as Bag)[f.key] = box.checked;
      touched(p);
    });
    const lab = h("label", "", f.label);
    lab.htmlFor = box.id;
    row.className = "ed-f ed-flag";
    row.append(box, lab);
    return row;
  }

  row.append(h("label", "", f.label));

  if (f.kind === "pick") {
    const sel = h("select");
    for (const o of f.options ?? []) {
      const opt = h("option", "", o);
      opt.value = o;
      sel.append(opt);
    }
    sel.value = String(value ?? "");
    sel.addEventListener("change", () => {
      write(p, f, sel.value);
      touched(p);
    });
    row.append(sel);
    return row;
  }

  if (f.kind === "paint") {
    const dot = h("input");
    dot.type = "color";
    dot.value = typeof value === "string" ? value : "#6d5334";
    dot.addEventListener("input", () => {
      write(p, f, dot.value);
      touched(p);
    });
    row.append(dot);
    return row;
  }

  if (f.kind === "num") {
    const num = h("input");
    num.type = "number";
    num.step = String(f.step ?? 1);
    if (f.min != null) num.min = String(f.min);
    if (f.max != null) num.max = String(f.max);
    num.value = String(round(Number(value ?? 0)));
    num.dataset.axis = f.onWall ?? "";
    num.addEventListener("input", () => {
      const n = Number(num.value);
      if (!Number.isFinite(n)) return; // half-typed "-" is not a width
      write(p, f, n);
      // a card moved sideways has not changed its face
      if (f.onWall) scheduleSave(p.slide);
      else touched(p);
    });
    row.append(num);
    return row;
  }

  if (f.kind === "table") {
    const area = h("textarea");
    area.rows = 4;
    area.placeholder = "Stop | Cards\n---\nOpening | 1";
    area.value = tableToText(value as TableLike | undefined);
    area.addEventListener("input", () => {
      write(p, f, textToTable(area.value));
      touched(p);
    });
    row.append(area);
    return row;
  }

  if (f.kind === "line") {
    const inp = h("input");
    inp.type = "text";
    inp.value = typeof value === "string" ? value : "";
    if (f.placeholder) inp.placeholder = f.placeholder;
    /* A path is fetched when it changes, so it is taken once it has
       been typed, not on every keystroke — half a filename is a 404
       and a complaint, and a path has ten of those in it. */
    inp.addEventListener(f.key === "image" ? "change" : "input", () => {
      write(p, f, inp.value);
      touched(p);
    });
    row.append(inp);
    return row;
  }

  // para and list are both a textarea; a list is one line per bullet
  const area = h("textarea");
  area.rows = f.kind === "list" ? 4 : 3;
  if (f.placeholder) area.placeholder = f.placeholder;
  area.value = Array.isArray(value)
    ? value.join("\n")
    : typeof value === "string"
      ? value
      : "";
  area.addEventListener("input", () => {
    write(
      p,
      f,
      f.kind === "list"
        ? area.value.split("\n").filter((l) => l.trim())
        : area.value,
    );
    touched(p);
  });
  row.append(area);
  return row;
}

/* Keep the two position fields in step with the wall while a card is
   being dragged, without rebuilding the panel under the pointer. */
function refreshPosition(p: Promise_) {
  const g = groupOf(p);
  if (!g || !body) return;
  for (const input of body.querySelectorAll<HTMLInputElement>("input[data-axis]")) {
    const axis = input.dataset.axis;
    if (axis === "x" || axis === "y")
      input.value = String(round(g.position[axis]));
  }
}

/* ------------------------------------------------------------------
   Changing the shape of the deck
------------------------------------------------------------------ */

/* Adding and removing go through the file rather than through the wall.

   A slide's cards, a deck's slides and their numbers are all decided
   when the deck is read; keeping a second, editor-shaped copy of that
   in step by hand is how the two drift apart. So the change is written,
   the dev server reloads the page, and the wall is built from the deck
   that is actually on disk. */
async function reshape(
  what: "save" | "add" | "remove" | "move",
  slide: number,
  payload?: Payload,
  current?: Payload,
  to?: number,
) {
  reloading = true;
  clearTimeout(saveT);
  try {
    const out =
      what === "save"
        ? await store.save(slide, payload ?? stopData(cardsOf(slide)), false)
        : what === "add"
          ? await store.add(slide, payload ?? stopData([]), current)
          : what === "remove"
            ? await store.remove(slide)
            : await store.move(slide, to ?? slide);
    unsaved.clear(); // the page is about to be rebuilt from what was written
    syncStatus();
    tell(out.note);
    /* The reload that follows lands wherever the address bar points.
       Point it at the slide that was just made, or moved — or, after
       a removal, at the one before it — so nobody has to walk back to
       their own edit. `replaceState`, not `location.hash`: the walk
       must not react to a slide that is not on the wall yet. */
    const land =
      what === "add"
        ? slide + 1
        : what === "remove"
          ? slide - 1
          : what === "move"
            ? (to ?? slide)
            : slide;
    history.replaceState(
      null,
      "",
      land > 0 ? `#slide-${land}` : location.pathname + location.search,
    );
    /* The dev server rebuilds the page when the file changes — unless
       it has been restarted since the page was loaded, in which case
       it no longer knows which page the file belongs to and says
       nothing. The wall would then sit on a deck that is not the one
       on disk. So: if the reload has not come in a moment, make it. A
       host has no watcher at all, and this is the reload. */
    setTimeout(() => location.reload(), 1500);
    return out;
  } catch (err) {
    reloading = false;
    if (err instanceof StaleError) stale(err);
    else tell(String(err instanceof Error ? err.message : err), true);
    return null;
  }
}

/* The slide after which a new one goes. On a numbered slide it is that
   slide; on the opening wide shot it is the front of the deck, and on
   the closing one the end — so an empty deck is a wall you press `e`
   on, and either overview is a place a deck can be grown from. */
function addAfter(): number {
  const ps = stop();
  if (ps.length) return ps[0]?.slide ?? 0;
  if (storyAt() === 0) return 0;
  return Math.max(0, ...beats.map((b) => (b.overview ? 0 : (b.slide ?? 0))));
}

/* ------------------------------------------------------------------
   Adding: what, and where
------------------------------------------------------------------ */

let addKind: Kind = (recall(KEY.kind) as Kind | null) ?? "note";
let addWhere: "here" | "after" = recall(KEY.where) === "after" ? "after" : "here";
let addPath = "";

async function doAdd() {
  const ps = stop();
  const here = ps[0]?.slide;
  const path = addKind === "photo" ? addPath.trim() : "";

  if (addWhere === "here" && here != null) {
    // the new card joins this slide, and is the one picked when the
    // page comes back
    const cards: Card[] = [...ps.map(cardData), newCardData(addKind, path)];
    remember(KEY.pick, String(ps.length));
    await reshape("save", here, { notes: cards });
    return;
  }

  /* A new slide. If the one being stood on has edits that were never
     written, they go into the same write — the reload that follows
     would otherwise throw them away. */
  const after = addAfter();
  const current =
    here != null && here === after && unsaved.has(here)
      ? stopData(ps)
      : undefined;
  remember(KEY.pick, "0");
  await reshape("add", after, newCardData(addKind, path), current);
}

/* A picture dropped on the wall is a photo card, on this slide or — from
   a wide shot — on a new slide at that end of the deck. */
async function dropPicture(file: File) {
  tell(`Uploading ${file.name}…`);
  try {
    addPath = await store.upload(file);
  } catch (err) {
    tell(`Could not upload: ${err instanceof Error ? err.message : err}`, true);
    return;
  }
  addKind = "photo";
  addWhere = stop().length ? "here" : "after";
  await doAdd();
}

/* ------------------------------------------------------------------
   Taking away, and taking it back
------------------------------------------------------------------ */

interface Undo {
  what: "card" | "slide" | "draft";
  slide: number;
  /** A stop, as the store carries one — or, for `draft`, the whole deck. */
  payload: unknown;
  label: string;
}

/* What was just removed is kept across the reload that follows, and
   offered back for a while. No "are you sure": a question before the
   act slows everyone down and stops nobody; a way back after it does. */
function removeCard(ps: Promise_[], at: number) {
  const slide = ps[0]?.slide ?? 0;
  const undo: Undo = {
    what: "card",
    slide,
    payload: stopData(ps),
    label: `Card removed from slide ${slide}`,
  };
  remember(KEY.undo, JSON.stringify(undo));
  remember(KEY.pick, String(Math.max(0, at - 1)));
  void reshape("save", slide, stopData(ps.filter((_, i) => i !== at)));
}

async function removeSlide(ps: Promise_[]) {
  const slide = ps[0]?.slide ?? 0;
  const undo: Undo = {
    what: "slide",
    slide,
    payload: stopData(ps),
    label: `Slide ${slide} deleted`,
  };
  // remembered before the write, in case the page is rebuilt before
  // the answer is read — then replaced by what was actually taken out,
  // so the undo puts back the author's own text, comment and all
  remember(KEY.undo, JSON.stringify(undo));
  const out = await reshape("remove", slide);
  if (out?.removed) remember(KEY.undo, JSON.stringify({ ...undo, payload: out.removed }));
}

/* The whole draft was replaced — discarded for what is published, or
   an old version restored into it — and the page rebuilt. The undo is
   the draft as it was, put back whole. Only a host can do this. */
function replacedDraft(label: string, was: Deck) {
  remember(KEY.undo, JSON.stringify({ what: "draft", slide: 0, payload: was, label } satisfies Undo));
  reloading = true;
  clearTimeout(saveT);
  setTimeout(() => location.reload(), 300);
}
async function putBackDraft(was: Deck) {
  if (!(store instanceof ApiStore)) return;
  reloading = true;
  try {
    const out = await store.replaceDraft(was);
    tell(out.note);
    setTimeout(() => location.reload(), 300);
  } catch (err) {
    reloading = false;
    if (err instanceof StaleError) stale(err);
    else tell(String(err instanceof Error ? err.message : err), true);
  }
}

let undoT: ReturnType<typeof setTimeout> | undefined;
function offerUndo(u: Undo) {
  document.getElementById("ed-undo")?.remove();
  hideHint(); // the key hint sits on the same edge; one thing at a time
  const bar = h("div");
  bar.id = "ed-undo";
  bar.setAttribute("role", "status");
  const gone = () => {
    clearTimeout(undoT);
    bar.remove();
  };
  bar.append(
    h("span", "", u.label),
    button("Undo", "", "Put it back", () => {
      gone();
      if (u.what === "draft") void putBackDraft(u.payload as Deck);
      else if (u.what === "card") void reshape("save", u.slide, u.payload as Payload);
      else void reshape("add", u.slide - 1, u.payload as Payload);
    }),
    button("×", "ed-x", "Dismiss", gone),
  );
  document.body.append(bar);
  undoT = setTimeout(gone, 12_000);
}

/* ------------------------------------------------------------------
   Dragging a card into place
------------------------------------------------------------------ */

let dragging: Promise_ | null = null;

/* A press is a pick until the pointer has actually travelled. Without
   this, the pixel of jitter inside an ordinary click was a drag: it
   pinned the card exactly where it already hung, and the next save
   wrote that spot into the file — a position nobody chose, which the
   layout could then no longer revise when the deck around it changed. */
const DRAG_PX = 4;

function initDrag() {
  const ray = new THREE.Raycaster();
  const at = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const grab = new THREE.Vector3();
  const facing = new THREE.Vector3(0, 0, 1);
  const from = { x: 0, y: 0 };
  let moving = false;

  const aim = (e: PointerEvent) => {
    at.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(at, camera);
  };

  // the wall steps forward on a click; while a card is being moved it
  // must not, and while the editor is open a click picks a card instead
  claimPointer(() => open);

  canvas.addEventListener("pointerdown", (e) => {
    if (!open) return;
    aim(e);
    const groups = storyCards();
    const found = ray.intersectObjects(groups, true)[0];
    if (!found) return;
    let node: import("three").Object3D | null = found.object;
    while (node && !groups.includes(node as CardGroup)) node = node.parent;
    const g = node as CardGroup | null;
    if (!g) return;

    // clicking a card is how you choose which one the panel is showing
    const i = groups.indexOf(g);
    if (i !== pick || view !== "slide") {
      pick = i;
      view = "slide";
      render();
    }

    plane.setFromNormalAndCoplanarPoint(facing, g.position);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    grab.subVectors(g.position, hit);
    dragging = g.userData.p;
    moving = false;
    from.x = e.clientX;
    from.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (!moving) {
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_PX) return;
      moving = true;
      root?.classList.add("ed-moving");
    }
    const g = groupOf(dragging);
    if (!g) return;
    aim(e);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    pin(dragging, "x", round(hit.x + grab.x));
    pin(dragging, "y", round(hit.y + grab.y));
    refreshPosition(dragging);
  });

  const drop = () => {
    if (!dragging) return;
    const p = dragging;
    dragging = null;
    if (!moving) return; // a click: the card was picked, not moved
    moving = false;
    root?.classList.remove("ed-moving");
    scheduleSave(p.slide, 300); // let go of, so it is where it will stay
  };
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);

  /* Two clicks on a card: write on it, where it is. The first click
     picked it; the second, this close behind, is the wish to type. */
  canvas.addEventListener("dblclick", (e) => {
    if (!open) return;
    const groups = storyCards();
    const g = cardAt(e.clientX, e.clientY, groups);
    if (!g) return;
    const i = groups.indexOf(g);
    if (i !== pick || view !== "slide") {
      pick = i;
      view = "slide";
      render();
    }
    inplace.open(g.userData.p);
  });

  /* A picture file dropped anywhere on the wall becomes a photo card.
     The browser would otherwise open the file in place of the deck. */
  addEventListener("dragover", (e) => {
    if (!open || !e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    root?.classList.add("ed-dropping");
  });
  addEventListener("dragleave", (e) => {
    if (e.relatedTarget == null) root?.classList.remove("ed-dropping");
  });
  addEventListener("drop", (e) => {
    root?.classList.remove("ed-dropping");
    if (!open) return;
    const file = e.dataTransfer?.files?.[0];
    if (!isPicture(file)) return;
    e.preventDefault();
    void dropPicture(file);
  });
}

/* ------------------------------------------------------------------
   Drawing the panel
------------------------------------------------------------------ */

function button(label: string, cls: string, title: string, go: () => void) {
  const b = h("button", cls, label);
  b.type = "button";
  b.title = title;
  b.addEventListener("click", go);
  return b;
}

/* A group of fields under a heading, folded or not. Which groups are
   open is remembered, so a panel opens the way it was left. */
const folded = new Set<string>(
  (recall(KEY.sections) ?? "text,look,place,kind").split(",").filter(Boolean),
);
function section(id: string, title: string, hint?: string): HTMLDetailsElement {
  const d = h("details", "ed-sec");
  d.open = !folded.has(id);
  const s = h("summary");
  s.append(h("b", "", title));
  if (hint) s.append(h("i", "", hint));
  d.append(s);
  d.addEventListener("toggle", () => {
    if (d.open) folded.delete(id);
    else folded.add(id);
    remember(KEY.sections, [...folded].join(","));
  });
  return d;
}

function setHead(title: string, canGoBack: boolean) {
  if (head) head.textContent = title;
  if (back) back.hidden = !canGoBack;
  if (status) status.hidden = canGoBack;
}

/* What to call a card, or a slide by its first card: its title, or
   its caption, or its first line of text — a photo often has only a
   caption, and "Slide 5" says nothing. */
const nameOf = (cards: Promise_[], fallback: string) => {
  for (const c of cards) {
    const name = c.title || c.caption || c.text;
    if (name) return name;
  }
  return fallback;
};

/* Every slide, in order, each wearing the kinds of its cards. Click
   one to go there; drag it — or use the arrows — to put it somewhere
   else. The order is the deck's, so a move is written like any other
   change of shape and the page rebuilt from it. */
function slideList() {
  const list = h("ol", "ed-list");
  const slides = beats.filter((b) => !b.overview);
  const here = slideNow();
  let lifted = -1;
  slides.forEach((b, i) => {
    const n = b.slide ?? i + 1;
    const cards = (b._gs ?? []).map((g) => g.userData.p);
    const row = h("li", `ed-row${n === here ? " here" : ""}`);
    row.draggable = true;

    const go = h("button", "ed-row-go");
    go.type = "button";
    go.title = `Go to slide ${n} · drag to move it`;
    const kinds = h("span", "ed-row-kinds");
    for (const c of cards) kinds.append(swatch(kindOf(c.type).kind, true));
    go.append(
      h("b", "", String(n)),
      kinds,
      h("span", "ed-row-title", nameOf(cards, `Slide ${n}`)),
    );
    go.addEventListener("click", () => storyGoToSlide(n));

    const moves = h("span", "ed-row-moves");
    const up = button("▲", "", "Move up", () => void moveSlideTo(n, n - 1));
    const down = button("▼", "", "Move down", () => void moveSlideTo(n, n + 1));
    up.disabled = i === 0;
    down.disabled = i === slides.length - 1;
    moves.append(up, down);
    row.append(go, moves);

    row.addEventListener("dragstart", (e) => {
      lifted = n;
      row.classList.add("lifting");
      e.dataTransfer?.setData("text/plain", String(n));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      lifted = -1;
      row.classList.remove("lifting");
      for (const r of list.querySelectorAll(".over")) r.classList.remove("over");
    });
    row.addEventListener("dragover", (e) => {
      if (lifted < 0) return; // a file, not a slide
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      row.classList.add("over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("over"));
    row.addEventListener("drop", (e) => {
      if (lifted < 0) return;
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("over");
      const from = lifted;
      lifted = -1;
      if (from !== n) void moveSlideTo(from, n);
    });
    list.append(row);
  });
  return list;
}

const moveSlideTo = (from: number, to: number) =>
  reshape("move", from, undefined, undefined, to);

/* The whole deck, from a slide: the same list the wide shot shows,
   reached without walking out to it. */
function renderList() {
  if (!body || !foot) return;
  const count = beats.filter((b) => !b.overview).length;
  setHead(`Slides · ${count}`, true);
  body.append(
    h("p", "ed-hint", "Click a slide to go to it. Drag one — or use the arrows — to put it somewhere else."),
  );
  body.append(slideList());
  body.append(roomSection());
  foot.append(
    button("+ Add a slide after this one", "ed-go ed-wide", "Add a slide after the one you are on", () => {
      addWhere = "after";
      view = "add";
      render();
    }),
  );
}

/* ------------------------------------------------------------------
   The room
------------------------------------------------------------------ */

const ROOM_WORDS: Record<RoomName, [string, string]> = {
  plaster: ["Plaster", "Warm plaster and oak boards, under one warm light."],
  studio: ["Studio", "A white gallery wall, concrete underfoot, cool even light."],
  night: ["Night", "Charcoal under one warm spot, dust in the beam. A dark mode, too."],
};

/* Try a room, and keep it. The room is rebuilt around the cards where
   they hang, and every card is drawn again so what the room decides
   for it — the paper it is on, the pin, the paint of a heading — comes
   with it. Then the choice is written into the deck, quietly: the wall
   already shows it. */
let changingRoom = false;
async function changeRoom(name: RoomName) {
  const was = currentRoom();
  if (name === was.name || changingRoom) return;
  changingRoom = true;
  // the knobs are the deck's, not the room's: they stay turned
  const room = resolveRoom(name, was.knobs);
  setRoom(room);
  applyChrome(room);
  buildRoom(room);
  lightRoom(room);
  for (const g of cards) {
    const p = g.userData.p;
    // what the old room had decided, the new one decides instead
    if (p.paper === was.paper.stock) p.paper = room.paper.stock;
    if (p.pinColor === was.paper.pin) p.pinColor = room.paper.pin;
  }
  for (const g of [...cards]) await redraw(g.userData.p);
  storyRefresh(true);
  render();
  await writeRoom(room);
  changingRoom = false;
}

/* What the deck says about its room, as the file should carry it: the
   room by name unless it is plaster, and each knob only where it is
   not what the room has by nature — a deck should not spell out what
   it would have got anyway. */
async function writeRoom(room: Room) {
  const natural = naturalKnobs(room.name);
  const k = room.knobs;
  try {
    const out = await store.setFields({
      room: room.name === "plaster" ? null : room.name,
      wall: k.wall ?? null,
      floor: k.floor && k.floor !== natural.floor ? k.floor : null,
      light: k.light && k.light !== natural.light ? k.light : null,
    });
    tell(out.note);
  } catch (err) {
    if (err instanceof StaleError) stale(err);
    else tell(`Could not save the room: ${err instanceof Error ? err.message : err}`, true);
  }
}

/* Turn a knob. The wall's tint redraws the headings too, since a dark
   room's chalk rule reads the wall; a floor or a light touches no card. */
let knobT: ReturnType<typeof setTimeout> | undefined;
async function turnKnob(change: Partial<Knobs>) {
  const was = currentRoom();
  const knobs: Knobs = { ...was.knobs, ...change };
  for (const key of Object.keys(knobs) as (keyof Knobs)[]) if (knobs[key] == null) delete knobs[key];
  const room = resolveRoom(was.name, knobs);
  setRoom(room);
  applyChrome(room);
  buildRoom(room);
  lightRoom(room);
  if (change.wall !== undefined)
    for (const g of [...cards]) if (g.userData.p.type === "mural") await redraw(g.userData.p);
  storyRefresh(true);
  render();
  await writeRoom(room);
}

/* A knob's row: a name, and the ways it can be set. */
function knobRow(label: string, control: HTMLElement) {
  const row = h("div", "ed-f");
  row.append(h("label", "", label), control);
  return row;
}
function knobSeg<T extends string>(
  options: readonly T[],
  names: Record<T, string>,
  current: T,
  natural: T,
  choose: (v: T) => void,
) {
  const seg = h("div", "ed-seg");
  for (const o of options) {
    const b = h("button", o === current ? "on" : "", names[o]);
    b.type = "button";
    if (o === natural) b.title = "What this room has by nature";
    b.addEventListener("click", () => choose(o));
    seg.append(b);
  }
  return seg;
}

/* A little picture of each room — its wall, its floor, its light — to
   choose by, the way the kinds are chosen. */
function roomSection() {
  const sec = section("room", "Room", currentRoom().name);
  const list = h("div", "ed-rooms");
  list.setAttribute("role", "radiogroup");
  list.setAttribute("aria-label", "The room the deck hangs in");
  for (const name of ROOMS) {
    const room = roomNamed(name);
    // by name: the room in use is a resolved copy, never the preset itself
    const on = name === currentRoom().name;
    const b = h("button", `ed-room${on ? " on" : ""}`);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(on));
    const sw = h("span", "ed-rm");
    sw.style.setProperty("--wall", room.plaster.base);
    sw.style.setProperty("--floor", `#${room.floor.tint.toString(16).padStart(6, "0")}`);
    sw.style.setProperty("--light", `#${room.light.key.toString(16).padStart(6, "0")}`);
    sw.setAttribute("aria-hidden", "true");
    const words = h("span");
    const [title, blurb] = ROOM_WORDS[name];
    words.append(h("b", "", title), h("small", "", blurb));
    b.append(sw, words);
    b.addEventListener("click", () => void changeRoom(name));
    list.append(b);
  }
  sec.append(list);
  sec.append(
    h("p", "ed-hint", "A room is chosen whole: the wall, the floor, the light, and what a card gets when you say nothing. Anything you set on a card is kept."),
  );

  /* The knobs: the wall's tint, the floor, the light. Each shows what
     the room has by nature until it is turned, and can be turned back. */
  const room = currentRoom();
  const natural = naturalKnobs(room.name);
  const preset = roomNamed(room.name);

  const wall = h("div", "ed-knob");
  const tint = h("input");
  tint.type = "color";
  tint.value = room.knobs.wall ?? preset.plaster.base;
  tint.title = "The wall's tint. It stays plaster whatever you pick.";
  tint.addEventListener("input", () => {
    clearTimeout(knobT);
    knobT = setTimeout(() => void turnKnob({ wall: tint.value }), 250);
  });
  wall.append(tint, h("span", "ed-knob-now", room.knobs.wall ? `tinted ${room.plaster.base}` : "the room's own"));
  if (room.knobs.wall)
    wall.append(button("Reset", "ed-mini", "Back to the room's own wall", () => void turnKnob({ wall: undefined })));
  sec.append(knobRow("Wall", wall));

  sec.append(
    knobRow(
      "Floor",
      knobSeg(FLOORS, { oak: "Oak", concrete: "Concrete", none: "None" }, room.knobs.floor ?? natural.floor, natural.floor, (v) =>
        void turnKnob({ floor: v === natural.floor ? undefined : v }),
      ),
    ),
  );
  sec.append(
    knobRow(
      "Light",
      knobSeg(LIGHTS, { warm: "Warm", cool: "Cool" }, room.knobs.light ?? natural.light, natural.light, (v) =>
        void turnKnob({ light: v === natural.light ? undefined : v }),
      ),
    ),
  );
  return sec;
}

/* The wide shots: nothing to edit, but the whole deck to see and to
   grow from. */
function renderOverview() {
  if (!body || !foot) return;
  const count = beats.filter((b) => !b.overview).length;
  const bare = !count;
  setHead(bare ? "An empty wall" : `Overview · ${count} slide${count > 1 ? "s" : ""}`, false);
  if (bare) {
    body.append(
      h(
        "p",
        "ed-empty",
        store.kind === "file"
          ? "Nothing is pinned up yet. Add the first slide and it is written into your deck file."
          : "Nothing is pinned up yet. Add the first slide and it is kept with your deck.",
      ),
    );
  } else {
    body.append(
      h("p", "ed-hint", "Click a slide to go to it. Drag one — or use the arrows — to put it somewhere else."),
    );
    body.append(slideList());
  }
  body.append(h("p", "ed-hint", "You can also drop a picture anywhere on the wall."));
  body.append(roomSection());
  foot.append(
    button(bare ? "+ Add the first slide" : "+ Add a slide", "ed-go ed-wide", "Add a slide to the deck", () => {
      addWhere = "after";
      view = "add";
      render();
    }),
  );
}

/* Where a picture comes from: a file dropped or chosen, or a path
   typed. The file is the first way, because it is the one that does
   not ask the author to know where public/ is. */
function pictureSource(onPath: (path: string) => void, current: string) {
  const box = h("div", "ed-f");
  box.append(h("label", "", "Picture"));
  const zone = h("button", "ed-drop");
  zone.type = "button";
  zone.append(h("b", "", "Drop an image here, or choose a file"), h("small", "", `PNG, JPEG, GIF or WebP. ${store.pictureNote}`));
  const take = async (file: File | undefined) => {
    if (!isPicture(file)) return;
    zone.classList.add("busy");
    tell(`Uploading ${file.name}…`);
    try {
      onPath(await store.upload(file));
      tell("");
    } catch (err) {
      tell(`Could not upload: ${err instanceof Error ? err.message : err}`, true);
    }
    zone.classList.remove("busy");
  };
  zone.addEventListener("click", () => void pickFile().then(take));
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove("over");
    void take(e.dataTransfer?.files?.[0]);
  });
  box.append(zone);

  const path = h("input");
  path.type = "text";
  path.placeholder = store.pictureHint;
  path.value = current;
  path.addEventListener("change", () => onPath(path.value.trim()));
  box.append(path);
  return box;
}

/* The chooser: what is being added, and where. */
function renderAdd() {
  if (!body || !foot) return;
  const ps = stop();
  const here = ps[0]?.slide;
  const after = addAfter();
  setHead(here != null ? `Add to slide ${here}` : "Add a slide", true);

  const kinds = h("div", "ed-kinds");
  kinds.setAttribute("role", "radiogroup");
  kinds.setAttribute("aria-label", "What to add");
  for (const k of KINDS) {
    const b = h("button", `ed-kind${k.kind === addKind ? " on" : ""}`);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(k.kind === addKind));
    const words = h("span");
    words.append(h("b", "", k.name), h("small", "", k.blurb));
    b.append(swatch(k.kind), words);
    b.addEventListener("click", () => {
      addKind = k.kind;
      remember(KEY.kind, addKind);
      render();
    });
    kinds.append(b);
  }
  body.append(kinds);

  if (addKind === "photo")
    body.append(
      pictureSource((path) => {
        addPath = path;
        render();
      }, addPath),
    );

  if (here != null) {
    const w = h("div", "ed-f");
    w.append(h("label", "", "Where"));
    const seg = h("div", "ed-seg");
    const opts: ["here" | "after", string][] = [
      ["here", "This slide"],
      ["after", "New slide after"],
    ];
    for (const [id, label] of opts) {
      const b = h("button", addWhere === id ? "on" : "", label);
      b.type = "button";
      b.addEventListener("click", () => {
        addWhere = id;
        remember(KEY.where, id);
        render();
      });
      seg.append(b);
    }
    w.append(seg);
    body.append(w);
  } else {
    body.append(
      h(
        "p",
        "ed-hint",
        after ? "Goes at the end of the deck." : "Goes at the start of the deck.",
      ),
    );
  }

  const name = kindNamed(addKind).name.toLowerCase();
  foot.append(
    button("Cancel", "", "Back to the slide", () => {
      view = "slide";
      render();
    }),
    button(`Add ${name}`, "ed-go", "Write it into the deck", () => void doAdd()),
  );
}

/* Three lines for the first minute on a hosted wall, over the fields,
   until dismissed. Not beside `pnpm dev`: whoever runs that read the
   README. Remembered across pages, not just this tab. */
const COACH = "storyboard:coached";
function coachMark(): HTMLElement | null {
  if (store.kind !== "api") return null;
  try {
    if (localStorage.getItem(COACH)) return null;
  } catch {
    return null;
  }
  const box = h("div", "ed-coach");
  const list = h("ol");
  for (const line of [
    "Double-click a card to write on it, or type in the fields below; it redraws as you go.",
    "Drag a card on the wall to move it. + Add puts another beside it.",
    "Press Keep it or Publish when it is ready to be seen.",
  ])
    list.append(h("li", "", line));
  box.append(list);
  box.append(
    button("Got it", "ed-mini", "Hide these three lines", () => {
      try {
        localStorage.setItem(COACH, "1");
      } catch {
        /* a page that may not remember still edits */
      }
      box.remove();
    }),
  );
  return box;
}

/* One slide: its cards, and the picked card's fields in groups. */
function renderSlide(ps: Promise_[]) {
  if (!body || !foot) return;
  pick = Math.min(pick, ps.length - 1);
  const p = ps[pick];
  if (!p) return;
  const slide = p.slide;
  setHead(`Slide ${slide} · ${ps.length} card${ps.length > 1 ? "s" : ""}`, false);
  const coach = coachMark();
  if (coach) body.append(coach);

  // the cards of this slide, each wearing its kind
  const chips = h("div", "ed-chips");
  ps.forEach((c, i) => {
    const b = h("button", `ed-chip${i === pick ? " on" : ""}`);
    b.type = "button";
    b.title = kindOf(c.type).name;
    b.append(swatch(kindOf(c.type).kind, true), h("span", "", nameOf([c], `Card ${i + 1}`)));
    b.addEventListener("click", () => {
      pick = i;
      render();
    });
    chips.append(b);
  });
  body.append(chips);

  const t = p.type;

  // what the wall draws: first, open, and different for each kind
  const wall = section("wall", "On the wall", kindOf(t).name.toLowerCase());
  if (t === "photo") {
    wall.append(
      pictureSource((path) => {
        write(p, F.image, path);
        touched(p);
        render();
      }, p.image ?? ""),
    );
    wall.append(fieldRow(p, F.caption));
    wall.append(
      h("p", "ed-hint", "A photo shows its picture, and a caption if it has one. If the file never arrives, the words below stand in for it."),
    );
  } else {
    for (const f of onTheWall(t)) wall.append(fieldRow(p, f));
  }
  const onCard = h("div", "ed-acts");
  onCard.append(
    button(t === "photo" ? "Write the caption on it" : "Write on it", "", "Type on the card itself — or double-click it on the wall", () =>
      inplace.open(p),
    ),
  );
  wall.append(onCard);
  body.append(wall);

  // a photo's words: published beside the wall, never drawn on it
  const text = inTheText(t);
  if (text.length) {
    const sec = section("text", "In the text version", "title, text, bullets, table");
    sec.append(
      h("p", "ed-hint", "Not drawn on the wall. Published for readers, search and screen readers — press T to see it."),
    );
    for (const f of text) sec.append(fieldRow(p, f));
    body.append(sec);
  }

  const talk = section("say", "Narration", "what you say · press P to see it");
  talk.append(fieldRow(p, F.say));
  talk.append(
    h(
      "p",
      "ed-hint",
      "Press P and this opens in a second window, beside the next slide and a clock — put the wall on the projector and that window on your laptop. It is published in the text version (T) too. It is never drawn on the wall.",
    ),
  );
  body.append(talk);

  const style = section("look", "Look", look(t).map((f) => String(read(p, f) ?? "")).filter(Boolean).join(" · "));
  for (const f of look(t)) style.append(fieldRow(p, f));
  body.append(style);

  const place = section("place", "Placement", `${round(p.w)} wide · drag to move`);
  place.append(h("p", "ed-hint", "Drag the card on the wall to move it. Anything set here is kept; anything left alone, the wall decides."));
  const nums = h("div", "ed-grid");
  for (const f of PLACEMENT) nums.append(fieldRow(p, f));
  place.append(nums);
  const placeActs = h("div", "ed-acts");
  placeActs.append(
    button("Let the wall place it", "", "Forget the pinned position and let the wall lay this card out again", () => {
      p.autoX = true;
      p.autoY = true;
      void reshape("save", slide, stopData(stop()));
    }),
    button("Space out", "", "Push apart anything that overlaps", () => {
      spaceOutCards();
      storyRefresh(true);
    }),
  );
  place.append(placeActs);
  body.append(place);

  // changing the kind is possible, but it is a conversion, not a field
  const conv = section("kind", "Change kind…");
  conv.append(
    h("p", "ed-hint", "A photo shows only its picture, a heading only its heading and a line. Words that no longer fit stay in the file and in the text version."),
  );
  const seg = h("div", "ed-seg");
  for (const k of KINDS) {
    const b = h("button", t === k.type ? "on" : "", k.name);
    b.type = "button";
    b.addEventListener("click", () => {
      retype(p, k.type);
      render(); // the fields change with the kind…
      touched(p); // …and this comes after, so the status survives it
    });
    seg.append(b);
  }
  conv.append(seg);
  body.append(conv);

  // taking things away: the card here, the slide at the very end
  const gone = h("div", "ed-acts ed-gone");
  gone.append(
    button(
      ps.length > 1 ? "Remove this card" : "Delete this slide",
      "ed-danger",
      ps.length > 1 ? "Take this card off the slide — you can undo it" : "Take this whole slide out of the deck — you can undo it",
      () => (ps.length > 1 ? removeCard(ps, pick) : removeSlide(ps)),
    ),
  );
  if (ps.length > 1)
    gone.append(
      button("Delete this slide", "ed-danger ed-quiet", "Take this whole slide out of the deck — you can undo it", () =>
        removeSlide(ps),
      ),
    );
  body.append(gone);

  foot.append(
    button("Slides", "ed-narrow", "Every slide in the deck — go to one, or reorder them", () => {
      view = "list";
      render();
    }),
    button("+ Add", "ed-go", "Add a note, a photo or a heading", () => {
      view = "add";
      render();
    }),
  );
  foot.append(h("p", "ed-hint", "Saved as you go · ⌘S saves right now · double-click a card to write on it · drop a picture to add it"));
}

function render() {
  if (!body || !foot) return;
  body.replaceChildren();
  foot.replaceChildren();
  const ps = stop();

  if (view === "add") renderAdd();
  else if (view === "publish" && store instanceof ApiStore)
    renderPublish({
      store,
      body,
      foot,
      setHead,
      tell,
      button,
      section,
      close: () => {
        view = "slide";
        render();
      },
      replaced: replacedDraft,
      stale,
    });
  else if (view === "list" && ps.length) renderList();
  else if (!ps.length) renderOverview();
  else renderSlide(ps);

  say = h("p", "ed-note", "");
  foot.append(say);
  syncStatus();
}

function build() {
  root = h("aside", "ed");
  root.id = "editor";

  const bar = h("header");
  back = h("button", "ed-x", "‹");
  back.type = "button";
  back.title = "Back";
  back.setAttribute("aria-label", "Back to the slide");
  back.hidden = true;
  back.addEventListener("click", () => {
    view = "slide";
    render();
  });
  head = h("b", "", "Slide");
  status = h("span", "ed-status", "Saved");
  const shut = h("button", "ed-x", "×");
  shut.type = "button";
  shut.title = "Close (e)";
  shut.setAttribute("aria-label", "Close the editor");
  shut.addEventListener("click", toggle);
  const left = h("span", "ed-head");
  left.append(back, head);
  const right = h("span", "ed-head");
  right.append(status, shut);
  bar.append(left, right);

  body = h("div", "ed-body");
  foot = h("footer", "ed-foot");
  root.append(bar);
  /* On a host a saved draft is not a published deck. The bar under the
     header says which the wall is showing, and is the way to publish. */
  if (store instanceof ApiStore)
    root.append(
      initPublish(store, () => {
        view = view === "publish" ? "slide" : "publish";
        render();
      }),
    );
  root.append(body, foot);
  document.body.append(root);
  initDrag();

  onStoryMove(() => {
    inplace.close();
    pick = pendingPick ?? 0;
    pendingPick = null;
    view = "slide";
    if (open) render();
  });
}

function toggle() {
  if (!root) build();
  if (open) inplace.close();
  open = !open;
  root?.classList.toggle("show", open);
  document.body.classList.toggle("ed-open", open);
  remember(KEY.open, open ? "1" : "");
  /* The panel covers the right edge of the wall. The camera is told,
     so a stop is framed in the part of the window that can be seen,
     not half under the fields that edit it. */
  fitCamera(open ? (root?.offsetWidth ?? 0) : 0);
  storyReframe();
  if (open) render();
}

/* A phone, as opposed to a small window on a desk: a touch screen
   without room beside the wall, or a screen too narrow for the panel
   and any wall at all. A 700-pixel laptop window keeps its panel. */
const onAPhone = () =>
  (matchMedia("(pointer: coarse)").matches && innerWidth < 900) || innerWidth < 560;

function phoneNotice(publishedUrl: string | null): HTMLElement {
  const box = h("aside", "ed-phone");
  box.setAttribute("role", "note");
  box.append(
    h("b", "", "Edit this on a laptop"),
    h(
      "p",
      "",
      "The wall is edited beside itself, and a phone has no room beside it. Open this same link on a bigger screen — the deck is already saved here.",
    ),
  );
  const acts = h("div", "ed-acts");
  const copy = button("Copy the link", "ed-go", "Copy this page's address", () => {
    navigator.clipboard
      ?.writeText(location.href)
      .then(() => (copy.textContent = "Copied"))
      .catch(() => (copy.textContent = location.href));
  });
  acts.append(copy);
  if (publishedUrl) {
    const view = h("a", "", "See the published wall");
    view.href = publishedUrl;
    acts.append(view);
  }
  box.append(acts, button("×", "ed-x", "Dismiss", () => box.remove()));
  document.body.append(box);
  return box;
}

/** Open the editor with `e`. Loaded only where the deck may be edited — see the note at the top. */
export function initEditor() {
  const source = currentSource();
  store = source.hosted ? new ApiStore(source.hosted) : new FileStore();

  /* The wall is edited beside itself, and a phone has no room beside
     it: the panel would cover all but a sliver. Say so, once, and
     offer the link for a bigger screen. The draft is already here. A
     window that grows past a phone's width afterwards — a browser
     still settling its size, a tablet turned sideways — gets the
     panel after all. */
  if (store.kind === "api" && onAPhone()) {
    const notice = phoneNotice(source.hosted?.published ? source.hosted.url : null);
    const grown = () => {
      if (onAPhone()) return;
      removeEventListener("resize", grown);
      notice.remove();
      startEditor();
    };
    addEventListener("resize", grown);
    return;
  }
  startEditor();
}

/* Everything the panel needs once it is known there is room for it. */
function startEditor() {
  // a key nobody was told about is a key nobody presses
  console.info("storyboard: press e to edit this slide");
  const hint = document.getElementById("hint");
  if (hint) {
    const dot = h("em", "", "·");
    const key = h("kbd", "", "E");
    hint.append(dot, key, h("span", "", "edit this slide"));
  }

  // the card that was just made is the one to come back to
  const picked = recall(KEY.pick);
  if (picked) {
    pendingPick = Number(picked) || 0;
    remember(KEY.pick, "");
  }

  /* This module arrives by dynamic import, and the walk does not wait
     for it: on a busy server the deck can already be standing on its
     slide by now, and the move that would have applied the pending pick
     has come and gone. If so, pick now — otherwise the panel opens on
     the first card, and "Remove this card" takes the wrong one. */
  if (pendingPick != null && storyCards().length) {
    pick = pendingPick;
    pendingPick = null;
  }

  /* Open the way it was left in this tab. On a host, open to begin
     with: the page is the editor, and a closed panel would be a wall
     with nothing to say for itself. */
  const was = recall(KEY.open);
  if (was === "1" || (was === null && store.kind === "api")) toggle();

  // what was just taken away can be put back, for a while
  const undo = recall(KEY.undo);
  if (undo) {
    remember(KEY.undo, "");
    try {
      const u = JSON.parse(undo) as Undo;
      if (!root) build();
      offerUndo(u);
    } catch {
      /* not ours to offer, then */
    }
  }

  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      if (!open) return;
      e.preventDefault();
      saveNow();
      return;
    }
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      toggle();
    }
  });

  // anything still pending goes with the page, not after it
  addEventListener("pagehide", () => {
    if (saveT) {
      clearTimeout(saveT);
      const slide = slideNow();
      const ps = cardsOf(slide);
      if (slide && ps.length && !reloading) store.beacon(slide, stopData(ps));
    }
  });
}
