/* Writing on the card itself.

   The wall is a canvas, and a canvas has no caret. So the words of a
   card being written on are typed into an element laid exactly over
   it — the same size, the same tilt, the same hand and ink, following
   the card as the camera settles — while the texture underneath is
   drawn without them (see blankText in textures/draw.ts). Every
   keystroke goes to the card the same way the panel's fields do, so
   the card behind is already right by the time the element goes.

   What can be written here is what a hand writes: a note's title,
   text and bullets; a heading and the line under it; a photo's
   caption. Tables, footnotes and everything else keep to the panel.

   The overlay approximates the texture's layout rather than sharing
   it: the same sizes, gaps and margins in the texture's own units,
   shrunk in the same steps when the words outgrow the card. It is a
   place to type, not the final picture; the picture is drawn the
   moment it closes. */

import { THREE } from "../vendor.js";
import { camera, canvas } from "../scene/stage.js";
import { cards } from "../scene/card.js";
import type { CardGroup } from "../scene/card.js";
import { blankText } from "../textures/draw.js";
import { PAPERS } from "../textures/papers.js";
import { currentRoom } from "../rooms.js";
import type { Promise_ } from "../deck/types.js";

export type InPlaceKey = "title" | "text" | "bullets" | "caption";

export interface InPlaceHost {
  /** Put a value on the card, redraw it and schedule the save; "" or [] takes the field out. */
  set(p: Promise_, key: InPlaceKey, value: string | string[]): void;
  /** Redraw the card now, without a save — after the words were blanked or restored. */
  redraw(p: Promise_): void;
  /** The overlay has gone; the panel may want to show the card afresh. */
  closed(p: Promise_): void;
}

/* The texture's own units, from paper.ts, mural.ts and photo.ts. */
type Pair = [hand: number, sans: number];
const NOTE = {
  W: 512,
  pad: 46,
  padSpiral: 62,
  title: [56, 44] as Pair, // [hand or serif, sans]
  text: [46, 31] as Pair,
  bullet: [42, 29] as Pair,
  gapTitle: [26, 22] as Pair,
  gapText: 20,
  lh: [1.2, 1.34] as Pair,
};
const MURAL = { W: 1024, pad: 1024 * 0.045, title: 150, text: 64, gap: 56, lh: 1.14 };
const PHOTO = { W: 512, chin: 84, caption: 26 };

const groupOf = (p: Promise_) => cards.find((c) => c.userData.p === p);

const v = new THREE.Vector3();
/** A point in a card's own frame, on the screen. */
function onScreen(g: CardGroup, x: number, y: number) {
  v.set(x, y, 0);
  g.updateMatrixWorld();
  g.localToWorld(v);
  v.project(camera);
  return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
}

const face = (font: Promise_["font"], mural: boolean) =>
  font === "sans"
    ? "Inter, system-ui, sans-serif"
    : font === "serif" || (mural && font !== "hand")
      ? "'Cormorant Garamond', Georgia, serif"
      : "Caveat, cursive";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

/* A field that takes only words. `plaintext-only` where the browser
   has it; a paste is flattened to text everywhere. */
function editable<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, empty: string) {
  const n = el(tag, cls);
  n.setAttribute("contenteditable", "plaintext-only");
  if (!n.isContentEditable) n.setAttribute("contenteditable", "true");
  n.setAttribute("data-empty", empty);
  n.spellcheck = true;
  n.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  });
  return n;
}

const oneLine = (n: HTMLElement) => n.innerText.replace(/\s*\n\s*/g, " ").trim();
const lines = (n: HTMLElement) => n.innerText.replace(/\n{2,}/g, "\n").trim();

/** Put the caret at the end of a field. */
function caretEnd(n: HTMLElement) {
  n.focus();
  const sel = getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(n);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

interface Open {
  p: Promise_;
  box: HTMLElement;
  content: HTMLElement;
  W: number;
  raf: number;
  scale: number;
  away: (e: PointerEvent) => void;
  fit: () => void;
}

export function initInPlace(host: InPlaceHost) {
  let open: Open | null = null;

  /* Where the card is on the screen right now: its centre, its width
     and height in pixels, and how far it leans. Read every frame
     while the element is up, because the camera is still settling. */
  function place() {
    if (!open) return;
    const g = groupOf(open.p);
    if (!g) return;
    const { w, h } = g.userData;
    const c = onScreen(g, 0, 0);
    const r = onScreen(g, w / 2, 0);
    const t = onScreen(g, 0, h / 2);
    const wpx = 2 * Math.hypot(r.x - c.x, r.y - c.y);
    const hpx = 2 * Math.hypot(t.x - c.x, t.y - c.y);
    const angle = Math.atan2(r.y - c.y, r.x - c.x);
    const s = open.box.style;
    s.width = `${wpx}px`;
    s.height = `${hpx}px`;
    s.left = `${c.x - wpx / 2}px`;
    s.top = `${c.y - hpx / 2}px`;
    s.transform = `rotate(${angle}rad)`;
    // one texture unit, in pixels, at the scale the words currently fit at
    s.setProperty("--u", `${(wpx / open.W) * open.scale}px`);
  }

  function loop() {
    if (!open) return;
    place();
    open.raf = requestAnimationFrame(loop);
  }

  /* The texture shrinks its block until it fits the card; so does
     this, in the same steps, so long words do not spill off the paper
     while they are being typed. */
  function fitter(o: Open) {
    return () => {
      o.scale = 1;
      place();
      for (let i = 0; i < 14 && o.content.scrollHeight > o.box.clientHeight * 0.92; i++) {
        o.scale -= 0.04;
        place();
      }
    };
  }

  function build(p: Promise_): { box: HTMLElement; content: HTMLElement; W: number; first: HTMLElement } {
    const mural = p.type === "mural";
    const photo = p.type === "photo";
    const sans = p.font === "sans";
    const box = el("div", `ed-inplace${mural ? " ip-mural" : ""}${sans ? " ip-sans" : ""}`);
    box.style.setProperty("--ip-face", face(p.font, mural));
    const content = el("div", "ip-content");
    box.append(content);

    if (photo) {
      const ink = "rgba(43, 36, 28, 0.86)";
      box.style.setProperty("--ip-ink", ink);
      box.style.justifyContent = "flex-end";
      const cap = editable("div", "ip-caption", "A caption on the mat");
      cap.textContent = p.caption ?? "";
      cap.style.fontSize = `calc(var(--u) * ${PHOTO.caption})`;
      cap.style.height = `calc(var(--u) * ${PHOTO.chin})`;
      cap.style.display = "flex";
      cap.style.alignItems = "center";
      cap.style.justifyContent = "center";
      cap.addEventListener("input", () => host.set(p, "caption", oneLine(cap)));
      cap.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.preventDefault();
      });
      content.append(cap);
      return { box, content, W: PHOTO.W, first: cap };
    }

    const u = (n: number) => `calc(var(--u) * ${n})`;
    const hand: 0 | 1 = sans ? 1 : 0;
    const ink = mural
      ? (p.paint ?? currentRoom().paper.paint)
      : ((PAPERS[p.paper] || PAPERS.classic).ink || currentRoom().paper.ink);
    box.style.setProperty("--ip-ink", ink);
    const pad = mural ? MURAL.pad : (PAPERS[p.paper] || PAPERS.classic).spiral ? NOTE.padSpiral : NOTE.pad;
    box.style.padding = u(pad);
    box.style.lineHeight = String(mural ? MURAL.lh : NOTE.lh[hand]);
    // a table or a foot stays in the texture, below the words; keep the words up
    if (!mural && (p.table || p.foot)) box.style.justifyContent = "flex-start";

    const title = editable("div", "ip-title", mural ? "Heading" : "Title");
    title.textContent = p.title ?? "";
    title.style.fontSize = u(mural ? MURAL.title : NOTE.title[hand]);
    const text = editable("div", "ip-text", mural ? "A line under it" : "Text");
    text.textContent = p.text ?? "";
    text.style.fontSize = u(mural ? MURAL.text : NOTE.text[hand]);
    text.style.marginTop = u(mural ? MURAL.gap : NOTE.gapTitle[hand]);

    const list = el("ul");
    list.setAttribute("contenteditable", "true");
    list.spellcheck = true;
    list.style.fontSize = u(NOTE.bullet[hand]);
    list.style.marginTop = u(NOTE.gapText);
    const bullets = () =>
      [...list.querySelectorAll("li")].map((li) => oneLine(li)).filter(Boolean);
    const align = () => {
      const left = mural ? false : bullets().length > 0;
      content.style.textAlign = left ? "left" : "center";
    };
    const li = (words: string) => {
      const n = el("li");
      n.setAttribute("data-empty", "A bullet");
      n.textContent = words;
      return n;
    };
    for (const b of p.bullets ?? []) list.append(li(b));
    if (!mural) {
      if (!list.children.length) list.append(li(""));
      list.addEventListener("paste", (e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
      });
      list.addEventListener("input", () => {
        if (!list.querySelector("li")) list.append(li(""));
        host.set(p, "bullets", bullets());
        align();
      });
    }

    title.addEventListener("input", () => host.set(p, "title", oneLine(title)));
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        caretEnd(text);
      }
    });
    text.addEventListener("input", () => host.set(p, "text", lines(text)));

    content.append(title, text);
    if (!mural) content.append(list);
    align();
    return { box, content, W: mural ? MURAL.W : NOTE.W, first: p.title || !p.text ? title : text };
  }

  function close() {
    if (!open) return;
    const o = open;
    open = null;
    cancelAnimationFrame(o.raf);
    removeEventListener("pointerdown", o.away, true);
    o.box.remove();
    blankText(null);
    host.redraw(o.p);
    host.closed(o.p);
  }

  function openOn(p: Promise_) {
    if (open?.p === p) return;
    close();
    if (!groupOf(p)) return;
    const { box, content, W, first } = build(p);
    const o: Open = {
      p,
      box,
      content,
      W,
      raf: 0,
      scale: 1,
      away: () => {},
      fit: () => {},
    };
    o.fit = fitter(o);
    // a click anywhere but here is the end of it — and the start of whatever was clicked
    o.away = (e: PointerEvent) => {
      if (box.contains(e.target as Node)) return;
      close();
    };
    box.addEventListener("keydown", (e) => {
      // ours, and nobody else's: the walk also listens for Escape
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
    box.addEventListener("input", o.fit);
    open = o;
    // the words come off the texture, and the element takes their place
    blankText(p);
    host.redraw(p);
    document.body.append(box);
    addEventListener("pointerdown", o.away, true);
    place();
    o.fit();
    loop();
    caretEnd(first);
  }

  return {
    open: openOn,
    close,
    isOpen: () => open !== null,
    /** The card being written on, if any. */
    current: () => open?.p ?? null,
    /** The canvas, for whoever wires a double-click to `open`. */
    canvas,
  };
}
