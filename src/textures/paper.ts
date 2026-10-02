/* Paper: the stock, its lines, the handwriting, and the doodle. */

import { THREE } from "../vendor.js";
import { currentRoom } from "../rooms.js";
import { SS } from "../config.js";
import { rnd } from "../util.js";
import type { Promise_ } from "../deck/types.js";
import { PAPERS } from "./papers.js";
import { ctx2d, speckle, tornPath, wrapText, drawDoodle, rowH, isBlank } from "./draw.js";
import type { Row, LineRow } from "./draw.js";

export function makePaperTexture(p: Promise_) {
  const def = PAPERS[p.paper] || PAPERS.classic;
  const W = 512,
    ratio = p.ratio || rnd(1.05, 1.25);
  const H = Math.round(W * ratio);
  const c = document.createElement("canvas");
  c.width = W * SS;
  c.height = H * SS;
  const ctx = ctx2d(c);
  ctx.scale(SS, SS);
  ctx.clearRect(0, 0, W, H);
  // torn silhouette (or crisp rect)
  ctx.save();
  if (def.torn) {
    tornPath(ctx, W, H, 10, def.rough);
    ctx.clip();
  }
  ctx.fillStyle = def.base;
  ctx.fillRect(0, 0, W, H);
  // tonal blotches
  for (let i = 0; i < 7; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * W,
      Math.random() * H,
      10,
      Math.random() * W,
      Math.random() * H,
      rnd(90, 240),
    );
    g.addColorStop(
      0,
      i % 2 ? "rgba(255,255,255,.10)" : "rgba(120,95,60,.07)",
    );
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  speckle(ctx, W, H, (900 * def.grain * 10) | 0, def.grain * 0.9, true);
  speckle(ctx, W, H, 500, 0.06, false);
  // fibers
  ctx.strokeStyle = "rgba(110,90,60,.05)";
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    const x = Math.random() * W,
      y = Math.random() * H;
    ctx.moveTo(x, y);
    ctx.lineTo(x + rnd(-18, 18), y + rnd(-4, 4));
    ctx.stroke();
  }
  // ruled / grid
  if (def.lines === "ruled") {
    ctx.strokeStyle = "rgba(120,140,180,.35)";
    ctx.lineWidth = 1.4;
    for (let y = 86; y < H - 30; y += 42) {
      ctx.beginPath();
      ctx.moveTo(26, y);
      ctx.lineTo(W - 20, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(210,120,110,.4)";
    ctx.beginPath();
    ctx.moveTo(58, 20);
    ctx.lineTo(58, H - 20);
    ctx.stroke();
  } else if (def.lines === "grid") {
    ctx.strokeStyle = "rgba(120,140,120,.22)";
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let x = 0; x < W; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }
  if (def.spiral) {
    // punched holes down the left edge
    for (let y = 40; y < H - 20; y += 54) {
      ctx.fillStyle = "rgba(60,50,40,.45)";
      ctx.beginPath();
      ctx.arc(24, y, 7, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.beginPath();
      ctx.arc(22, y - 2, 6, 0, 7);
      ctx.fill();
    }
  }
  // edge darkening
  ctx.strokeStyle = "rgba(90,70,45,.22)";
  ctx.lineWidth = 8;
  if (def.torn) {
    tornPath(ctx, W, H, 12, def.rough);
    ctx.stroke();
  } else {
    ctx.strokeRect(4, 4, W - 8, H - 8);
  }
  // ---- text: an optional heading, a body, an optional list and a
  //      footnote, stacked and shrunk together until the block fits
  const ink = def.ink || currentRoom().paper.ink;
  const pad = def.spiral ? 62 : 46;
  const maxW = W - pad * 2;
  const face = (weight: number, size: number) =>
    p.font === "sans"
      ? `${weight} ${size}px Inter, system-ui, sans-serif`
      : p.font === "serif"
        ? `${weight} ${size}px 'Cormorant Garamond'`
        : `${weight} ${size}px Caveat`;
  const sans = p.font === "sans";
  const bullets = p.bullets || [];
  // a list reads as a list only when it is ranged left
  const left = bullets.length > 0;
  ctx.textBaseline = "middle";

  // `table: { head, rows }` — a figure the eye reads by column, so
  // it shrinks on width as well as height: the columns are measured
  // from their own contents and the whole block steps down until the
  // widest row clears the margins.
  const table = p.table;
  let cols: number[] = [],
    tableW = 0;

  let scale = 1,
    rows: Row[] = [],
    blockH = 0;
  for (;;) {
    rows = [];
    const push = (
      text: string,
      size: number,
      weight: number,
      opt?: Partial<LineRow>,
    ) => {
      ctx.font = face(weight, size);
      wrapText(ctx, text, maxW - ((opt && opt.indent) || 0)).forEach(
        (ln, j) =>
          rows.push(
            Object.assign(
              { ln, size, weight, lh: size * (sans ? 1.34 : 1.2) },
              opt,
              { dot: opt && opt.dot && j === 0 },
            ),
          ),
      );
    };
    if (p.title)
      push(p.title, Math.round((sans ? 44 : 56) * scale), 700);
    if (p.title && (p.text || bullets.length))
      rows.push({ gap: Math.round((sans ? 22 : 26) * scale) });
    if (p.text) push(p.text, Math.round((sans ? 31 : 46) * scale), 500);
    if (p.text && bullets.length)
      rows.push({ gap: Math.round(20 * scale) });
    bullets.forEach((b, i) => {
      const size = Math.round((sans ? 29 : 42) * scale);
      push(b, size, 500, { dot: true, indent: Math.round(size * 1.1) });
      if (i < bullets.length - 1)
        rows.push({ gap: Math.round(size * 0.42) });
    });
    if (table) {
      rows.push({ gap: Math.round(22 * scale) });
      const size = Math.round((sans ? 27 : 38) * scale),
        lh = Math.round(size * 1.68),
        body = table.rows || [];
      const all = table.head ? [table.head].concat(body) : body;
      cols = [];
      all.forEach((cells, r) => {
        ctx.font = face(r === 0 && table.head ? 700 : 500, size);
        cells.forEach((cell, i) => {
          cols[i] = Math.max(cols[i] || 0, ctx.measureText(cell).width);
        });
      });
      // a hair of air between columns, and more before the numbers
      const gutter = size * 0.55;
      tableW = cols.reduce((a, w) => a + w, 0) + gutter * (cols.length - 1);
      if (table.head)
        rows.push({ cells: table.head, size, weight: 700, lh, head: 1 });
      body.forEach((cells) =>
        rows.push({ cells, size, weight: 500, lh, gutter }),
      );
    }
    if (p.foot) {
      rows.push({ gap: Math.round(26 * scale) });
      push(p.foot, Math.round((sans ? 25 : 36) * scale), 500, {
        faint: true,
      });
    }
    blockH = rows.reduce((a, r) => a + rowH(r), 0);
    if (
      (blockH < H - pad * 1.9 && tableW <= maxW) ||
      scale < (table ? 0.3 : 0.45)
    )
      break;
    scale -= 0.04;
  }

  // being written on: the layout is kept, the words are left to the hand over the card
  const quiet = isBlank(p);
  let ty = H / 2 - blockH / 2 - H * 0.02;
  rows.forEach((r) => {
    if ("gap" in r) {
      ty += r.gap;
      return;
    }
    if (quiet) {
      ty += r.lh;
      return;
    }
    // a table row: the label ranged left, every figure ranged right
    // under its own column, and a rule under the header
    if ("cells" in r) {
      const gutter = r.size * 0.55,
        x0 = W / 2 - tableW / 2;
      ctx.font = face(r.weight, r.size);
      ctx.fillStyle = r.head ? ink : ink + "dd";
      let cx = x0;
      r.cells.forEach((cell, i) => {
        const col = cols[i] ?? 0;
        ctx.textAlign = i === 0 ? "left" : "right";
        ctx.fillText(cell, i === 0 ? cx : cx + col, ty + r.lh / 2);
        cx += col + gutter;
      });
      if (r.head) {
        ctx.strokeStyle = ink + "66";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, ty + r.lh * 0.86);
        ctx.lineTo(x0 + tableW, ty + r.lh * 0.86 + rnd(-1, 1));
        ctx.stroke();
      }
      ty += r.lh;
      return;
    }
    ctx.font = face(r.weight, r.size);
    ctx.fillStyle = r.faint ? ink + "99" : ink;
    ctx.textAlign = left ? "left" : "center";
    const x = left ? pad + (r.indent || 0) : W / 2;
    ctx.save();
    ctx.translate(x + rnd(-1.5, 1.5), ty + r.lh / 2 + rnd(-1, 1));
    ctx.rotate(rnd(-0.008, 0.008)); /* human, not distorted */
    ctx.fillText(r.ln, 0, 0);
    ctx.restore();
    if (r.dot) {
      ctx.fillStyle = ink + "88";
      ctx.beginPath();
      ctx.arc(
        pad + r.size * 0.34,
        ty + r.lh / 2,
        r.size * 0.12,
        0,
        7,
      );
      ctx.fill();
    }
    ty += r.lh;
  });
  if (p.doodle && p.doodle !== "none")
    drawDoodle(ctx, p.doodle, W / 2, ty + 34, 44, ink + "b3");
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, ratio };
}

/* Writing that belongs to the wall itself — paint worked into the
   plaster instead of a note pinned over it. The canvas is left
   transparent, so the wall's own grain, blotches and block seams
   read straight through the letters; each stroke is laid down three
   times (a sunk edge, the paint, a lit ridge) so it catches the key
   light the way brushed signage does. */
