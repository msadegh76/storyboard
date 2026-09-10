/* Canvas drawing primitives shared by every texture below. */

import { rnd } from "../util.js";
import type { Doodle } from "../deck/types.js";

export type Ctx = CanvasRenderingContext2D;

/** A 2D context, or a clear failure. Every texture starts here. */
export function ctx2d(c: HTMLCanvasElement): Ctx {
  const ctx = c.getContext("2d");
  if (!ctx)
    throw new Error(
      "storyboard: this browser would not give us a 2D canvas context",
    );
  return ctx;
}

/* A block of writing is laid out as a list of rows before any of it is
   drawn, so the whole block can be measured and stepped down until it
   fits. A row is a blank space, a line of text, or a row of a table. */

/** Vertical air between blocks. */
export interface GapRow {
  gap: number;
}

/** One line of text, already wrapped. */
export interface LineRow {
  ln: string;
  size: number;
  weight: number;
  lh: number;
  /** A bullet before it. */
  dot?: boolean;
  /** How far it is indented past the bullet. */
  indent?: number;
  /** Set back, for a footnote. */
  faint?: number | boolean;
  /** A rule under it, for a painted heading. */
  rule?: number;
}

/** One row of a table: every cell ranged under its own column. */
export interface CellRow {
  cells: string[];
  size: number;
  weight: number;
  lh: number;
  /** The header row. */
  head?: number;
  /** Air between columns. */
  gutter?: number;
}

export type Row = GapRow | LineRow | CellRow;

/** The height a row takes, whatever kind it is. */
export const rowH = (r: Row) => ("gap" in r ? r.gap : r.lh);

export function speckle(
  ctx: Ctx,
  w: number,
  h: number,
  n: number,
  alpha: number,
  dark?: boolean,
) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * alpha;
    ctx.fillStyle = dark
      ? `rgba(70,55,35,${a})`
      : `rgba(255,255,255,${a})`;
    ctx.fillRect(
      Math.random() * w,
      Math.random() * h,
      rnd(0.6, 2.2),
      rnd(0.6, 2.2),
    );
  }
}
export function tornPath(
  ctx: Ctx,
  w: number,
  h: number,
  inset: number,
  rough?: boolean,
) {
  const j = rough ? inset * 0.9 : inset * 0.5;
  const pts: [number, number][] = [];
  const steps = 14;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      pts.push([
        x0 + (x1 - x0) * t + rnd(-j, j),
        y0 + (y1 - y0) * t + rnd(-j, j),
      ]);
    }
  };
  edge(inset, inset, w - inset, inset);
  edge(w - inset, inset, w - inset, h - inset);
  edge(w - inset, h - inset, inset, h - inset);
  edge(inset, h - inset, inset, inset);
  const first = pts[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
}
export function wrapText(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(" "),
    lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
export function drawDoodle(
  ctx: Ctx,
  kind: Doodle,
  x: number,
  y: number,
  s: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "none";
  if (kind === "heart") {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.32);
    ctx.bezierCurveTo(
      -s * 0.55,
      -s * 0.15,
      -s * 0.22,
      -s * 0.5,
      0,
      -s * 0.12,
    );
    ctx.bezierCurveTo(
      s * 0.22,
      -s * 0.5,
      s * 0.55,
      -s * 0.15,
      0,
      s * 0.32,
    );
    ctx.stroke();
  } else if (kind === "star") {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.2 : s * 0.45,
        a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = Math.cos(a) * r,
        py = Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (kind === "sprig") {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.quadraticCurveTo(s * 0.1, -s * 0.1, 0, -s * 0.5);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const yy = s * 0.3 - i * s * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(
        -s * 0.3,
        yy - s * 0.12,
        -s * 0.38,
        yy - s * 0.3,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(
        s * 0.3,
        yy - s * 0.12,
        s * 0.38,
        yy - s * 0.3,
      );
      ctx.stroke();
    }
  } else if (kind === "arrow") {
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.2);
    ctx.quadraticCurveTo(0, -s * 0.35, s * 0.5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.1);
    ctx.lineTo(s * 0.5, 0);
    ctx.lineTo(s * 0.25, s * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------
   A card being written on
------------------------------------------------------------------ */

/* While a card is edited in place, its words are typed into an element
   laid over it, so the texture underneath is drawn without them — the
   paper, the ruling, the pin, but no ink. One card at a time. */
let blanked: object | null = null;

/** Draw this card's texture without its words, until told otherwise. */
export const blankText = (p: object | null) => {
  blanked = p;
};
export const isBlank = (p: object) => blanked === p;
