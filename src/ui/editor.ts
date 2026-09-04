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

   Nothing here keeps a copy of the deck: the file is the deck, and
   this only ever hands it one slide at a time. See tools/deck-editor.js
   for the other half.

   This module is dev only — it is imported behind `import.meta.env.DEV`
   and never reaches a built deck. */

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
import type { CardType, Promise_ } from "../deck/types.js";
import type { CardGroup } from "../scene/card.js";

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
   The slide, written down
------------------------------------------------------------------ */

const q = (s: string) => JSON.stringify(s);

/* One card as an author would have written it.

   Only what was actually chosen: a value equal to the default this kind
   of card already gets is left out, and so is anything the engine
   derived rather than the author pinning. A deck that spells out the
   tilt of every card is a deck whose seed no longer means anything. */
function cardSource(p: Promise_, indent: string): string {
  const d = cardDefaults(p.type);
  const rows: string[] = [];
  const put = (k: string, v: string) => rows.push(`${indent}  ${k}: ${v},`);

  if (p.type === "mural") {
    // `mural: "Heading"` is the shorthand, and carries the title with it
    put("mural", p.title ? q(p.title) : "true");
    if (p.text) put("sub", q(p.text));
  } else {
    // an `image:` already says photo; anything else needs saying
    if (p.type === "photo" && !p.image) put("type", q("photo"));
    if (p.title) put("title", q(p.title));
    if (p.text) put("text", q(p.text));
  }

  if (p.image) put("image", q(p.image));
  if (p.caption) put("caption", q(p.caption));
  if (p.bullets?.length)
    put(
      "bullets",
      `[\n${p.bullets.map((b) => `${indent}    ${q(b)},`).join("\n")}\n${indent}  ]`,
    );
  if (p.foot) put("foot", q(p.foot));
  if (p.table) put("table", JSON.stringify(p.table));
  // the narration is content, not layout: it is always written back
  if (p.say) put("say", q(p.say));

  for (const k of ["paper", "attach", "font", "doodle"] as const) {
    const v = p[k];
    if (v != null && v !== (d as unknown as Bag)[k]) put(k, q(String(v)));
  }
  if (p.pinColor != null && p.pinColor !== d.pinColor)
    put("pinColor", `0x${p.pinColor.toString(16).padStart(6, "0")}`);
  if (p.type === "mural") {
    if (p.paint) put("paint", q(p.paint));
    if (p.rule === false) put("rule", "false");
    if (p.ink === false) put("ink", "false");
  }

  if (!p.autoWidth) put("w", String(round(p.w)));
  /* A note's ratio is measured from its words and never lands on the
     card, and a mural's comes from the defaults — so one that is here
     and is not the default is one the author pinned. */
  if (p.ratio != null && p.ratio !== (d as unknown as Bag).ratio)
    put("ratio", String(round(p.ratio)));
  if (!p.autoRot) put("rot", String(round(p.rot)));
  if (!p.autoX && p.x != null) put("x", String(round(p.x)));
  if (!p.autoY && p.y != null) put("y", String(round(p.y)));

  return `{\n${rows.join("\n")}\n${indent}}`;
}

/* A card that does not exist yet, of a given kind. The words are a
   placeholder the author is meant to overwrite — they say what the
   card is, so a wall of fresh cards still reads. */
function newCard(kind: Kind, indent: string, path = ""): string {
  const rows: string[] = [];
  const put = (k: string, v: string) => rows.push(`${indent}  ${k}: ${v},`);
  if (kind === "heading") {
    put("mural", q("New heading"));
    put("sub", q("a smaller line under it"));
  } else if (kind === "photo") {
    if (path) put("image", q(path));
    else put("type", q("photo"));
    put("title", q("New picture"));
  } else {
    put("title", q("New card"));
    put("text", q("Say something here."));
  }
  return `{\n${rows.join("\n")}\n${indent}}`;
}

/* The whole slide, ready to drop into `slides`. One card is written
   straight in; several are held together, which is what `notes` is. */
function slideSource(cards: string[]): string {
  if (cards.length === 1 && cards[0]) return cards[0];
  return `{\n  notes: [\n${cards.map((c) => `    ${c}`).join(",\n")},\n  ],\n}`;
}
const stopSource = (ps: Promise_[]) =>
  ps.length === 1 && ps[0]
    ? cardSource(ps[0], "")
    : slideSource(ps.map((p) => cardSource(p, "    ")));

/* ------------------------------------------------------------------
   Talking to the dev server
------------------------------------------------------------------ */

async function post<T>(what: string, body: unknown): Promise<T> {
  const res = await fetch(`/__deck/${what}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({ error: "no answer" }));
  if (!res.ok) throw new Error(out.error || `the server said ${res.status}`);
  return out as T;
}

interface Written {
  file: string;
  slides: number;
  note: string;
}

/* A picture, handed to the server to keep under public/slides/. What
   comes back is the path the deck will use. */
async function upload(file: File): Promise<string> {
  const data = await new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => bad(r.error);
    r.readAsDataURL(file);
  });
  const out = await post<{ path: string }>("asset", {
    name: file.name,
    type: file.type,
    data,
  });
  return out.path;
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
  open: "promise-wall:editor",
  pick: "promise-wall:editor:pick",
  kind: "promise-wall:editor:kind",
  where: "promise-wall:editor:where",
  sections: "promise-wall:editor:sections",
  undo: "promise-wall:editor:undo",
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
let view: "slide" | "add" | "list" = "slide";
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
    await post<Written>("save", { slide, block: stopSource(ps), quiet: true });
    unsaved.delete(slide);
    failed = false;
    tell("");
  } catch (err) {
    failed = true;
    tell(`Could not save: ${err instanceof Error ? err.message : err}`, true);
  }
  saving = false;
  syncStatus();
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
  block?: string,
  current?: string,
  to?: number,
) {
  reloading = true;
  clearTimeout(saveT);
  try {
    const out = await post<Written>(what, { slide, block, current, to });
    unsaved.clear(); // the page is about to be rebuilt from disk
    syncStatus();
    tell(`${out.note} → ${out.file}`);
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
       on disk. So: if the reload has not come in a moment, make it. */
    setTimeout(() => location.reload(), 1500);
    return true;
  } catch (err) {
    reloading = false;
    tell(String(err instanceof Error ? err.message : err), true);
    return false;
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
    const cards = [...ps.map((c) => cardSource(c, "    ")), newCard(addKind, "    ", path)];
    remember(KEY.pick, String(ps.length));
    await reshape("save", here, slideSource(cards));
    return;
  }

  /* A new slide. If the one being stood on has edits that were never
     written, they go into the same write — the reload that follows
     would otherwise throw them away. */
  const after = addAfter();
  const current =
    here != null && here === after && unsaved.has(here)
      ? stopSource(ps)
      : undefined;
  remember(KEY.pick, "0");
  await reshape("add", after, newCard(addKind, "", path), current);
}

/* A picture dropped on the wall is a photo card, on this slide or — from
   a wide shot — on a new slide at that end of the deck. */
async function dropPicture(file: File) {
  tell(`Uploading ${file.name}…`);
  try {
    addPath = await upload(file);
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
  what: "card" | "slide";
  slide: number;
  block: string;
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
    block: stopSource(ps),
    label: `Card removed from slide ${slide}`,
  };
  remember(KEY.undo, JSON.stringify(undo));
  remember(KEY.pick, String(Math.max(0, at - 1)));
  void reshape("save", slide, stopSource(ps.filter((_, i) => i !== at)));
}

function removeSlide(ps: Promise_[]) {
  const slide = ps[0]?.slide ?? 0;
  const undo: Undo = {
    what: "slide",
    slide,
    block: stopSource(ps),
    label: `Slide ${slide} deleted`,
  };
  remember(KEY.undo, JSON.stringify(undo));
  void reshape("remove", slide);
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
      if (u.what === "card") void reshape("save", u.slide, u.block);
      else void reshape("add", u.slide - 1, u.block);
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
      h("span", "ed-row-title", cards[0]?.title || cards[0]?.text || `Slide ${n}`),
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
  foot.append(
    button("+ Add a slide after this one", "ed-go ed-wide", "Add a slide after the one you are on", () => {
      addWhere = "after";
      view = "add";
      render();
    }),
  );
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
        "Nothing is pinned up yet. Add the first slide and it is written into your deck file.",
      ),
    );
  } else {
    body.append(
      h("p", "ed-hint", "Click a slide to go to it. Drag one — or use the arrows — to put it somewhere else."),
    );
    body.append(slideList());
  }
  body.append(h("p", "ed-hint", "You can also drop a picture anywhere on the wall."));
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
  zone.append(h("b", "", "Drop an image here, or choose a file"), h("small", "", "PNG, JPEG, GIF or WebP. It is copied into public/slides/ and named for you."));
  const take = async (file: File | undefined) => {
    if (!isPicture(file)) return;
    zone.classList.add("busy");
    tell(`Uploading ${file.name}…`);
    try {
      onPath(await upload(file));
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
  path.placeholder = "or a path under public/ — slides/dashboard.png";
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

/* One slide: its cards, and the picked card's fields in groups. */
function renderSlide(ps: Promise_[]) {
  if (!body || !foot) return;
  pick = Math.min(pick, ps.length - 1);
  const p = ps[pick];
  if (!p) return;
  const slide = p.slide;
  setHead(`Slide ${slide} · ${ps.length} card${ps.length > 1 ? "s" : ""}`, false);

  // the cards of this slide, each wearing its kind
  const chips = h("div", "ed-chips");
  ps.forEach((c, i) => {
    const b = h("button", `ed-chip${i === pick ? " on" : ""}`);
    b.type = "button";
    b.title = kindOf(c.type).name;
    b.append(swatch(kindOf(c.type).kind, true), h("span", "", c.title || c.text || `Card ${i + 1}`));
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
      void reshape("save", slide, stopSource(stop()));
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
  foot.append(h("p", "ed-hint", "Saved as you go · ⌘S saves right now · drop a picture on the wall to add it"));
}

function render() {
  if (!body || !foot) return;
  body.replaceChildren();
  foot.replaceChildren();
  const ps = stop();

  if (view === "add") renderAdd();
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
  root.append(bar, body, foot);
  document.body.append(root);
  initDrag();

  onStoryMove(() => {
    pick = pendingPick ?? 0;
    pendingPick = null;
    view = "slide";
    if (open) render();
  });
}

function toggle() {
  if (!root) build();
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

/** Open the editor with `e`. Dev only — see the note at the top. */
export function initEditor() {
  // a key nobody was told about is a key nobody presses
  console.info("promise-wall: press e to edit this slide");
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

  if (recall(KEY.open) === "1") toggle();

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
      if (slide && ps.length && !reloading)
        navigator.sendBeacon?.(
          "/__deck/save",
          new Blob([JSON.stringify({ slide, block: stopSource(ps), quiet: true })], {
            type: "application/json",
          }),
        );
    }
  });
}
