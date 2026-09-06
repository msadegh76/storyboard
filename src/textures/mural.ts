/* Mural: writing painted into the plaster itself. No paper, no
   fixing, no shadow — the wall carries it. */

import { THREE } from "../vendor.js";
import { currentRoom } from "../rooms.js";
import { clamp, rnd } from "../util.js";
import type { Promise_ } from "../deck/types.js";
import { ctx2d, speckle, wrapText, rowH } from "./draw.js";
import type { Ctx, Row, LineRow } from "./draw.js";

/* A line once it knows where on the wall it lands. */
type Laid = LineRow & { y: number; half: number; tilt: number };

export function makeMuralTexture(p: Promise_) {
  const W = 1024,
    ratio = p.ratio || 0.2,
    H = Math.round(W * ratio);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = ctx2d(c);
  const paint = paintFor(p.paint);
  const face = (weight: number, size: number) =>
    p.font === "sans"
      ? `${weight} ${size}px Inter, system-ui, sans-serif`
      : p.font === "hand"
        ? `${weight} ${size}px Caveat`
        : `${weight} ${size}px 'Cormorant Garamond'`;
  const pad = W * 0.045;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // the same stack-and-shrink pass the paper uses, so a longer line
  // simply comes out smaller rather than running off the wall
  let scale = 1,
    rows: Row[] = [],
    blockH = 0;
  for (;;) {
    rows = [];
    const push = (
      text: string,
      size: number,
      weight: number,
      opt?: Partial<LineRow> | false | undefined,
    ) => {
      ctx.font = face(weight, size);
      wrapText(ctx, text, W - pad * 2).forEach((ln) =>
        rows.push(
          Object.assign({ ln, size, weight, lh: size * 1.14 }, opt),
        ),
      );
    };
    if (p.title)
      push(p.title, Math.round(150 * scale), 600, p.rule && {
        rule: 1,
      });
    if (p.title && p.text)
      rows.push({ gap: Math.round((p.rule ? 56 : 24) * scale) });
    if (p.text) push(p.text, Math.round(64 * scale), 500, { faint: 1 });
    if (p.foot) {
      rows.push({ gap: Math.round(22 * scale) });
      push(p.foot, Math.round(46 * scale), 500, { faint: 1 });
    }
    blockH = rows.reduce((a, r) => a + rowH(r), 0);
    if (blockH < H - pad * 1.1 || scale < 0.3) break;
    scale -= 0.03;
  }

  // where every line lands, settled once: both hands below draw
  // the same layout, and the ink hand has to draw it twice
  const lay: Laid[] = [];
  let ty = H / 2 - blockH / 2;
  rows.forEach((r) => {
    if ("gap" in r) {
      ty += r.gap;
      return;
    }
    if ("cells" in r) return; // a mural has no tables
    ctx.font = face(r.weight, r.size);
    lay.push(
      Object.assign({}, r, {
        y: ty + r.lh / 2 + rnd(-1, 1), // a hand, not a printer
        half: Math.min(W / 2 - pad, ctx.measureText(r.ln).width / 2),
        tilt: rnd(-2, 2),
      }),
    );
    ty += r.lh;
  });

  /* One line, laid into whichever canvas is asked for: the wall
     itself, or the mask the ink hand works off. */
  const line = (g: Ctx, r: Laid, dx: number, dy: number) => {
    g.font = face(r.weight, r.size);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(r.ln, W / 2 + dx, r.y + dy);
    if (!r.rule) return;
    g.save();
    g.translate(dx, dy);
    g.beginPath();
    g.moveTo(W / 2 - r.half, r.y + r.lh * 0.54);
    g.lineTo(W / 2 + r.half, r.y + r.lh * 0.54 + r.tilt);
    g.lineWidth = r.size * 0.055;
    g.lineCap = "round";
    g.strokeStyle = g.fillStyle;
    g.stroke();
    g.restore();
  };

  if (p.ink) {
    /* The ink hand: a can and a marker rather than a brush. The
       letters are cut once into a mask, and everything ink does to
       a wall is worked off that — it soaks in around the stroke,
       runs wherever gravity finds an edge, and leaves the fine
       mist of overspray that gives a can away. */
    const mask = document.createElement("canvas");
    mask.width = W;
    mask.height = H;
    const mc = ctx2d(mask);
    mc.fillStyle = "#fff";
    lay.forEach((r) => {
      mc.globalAlpha = r.faint ? 0.72 : 1; // a second, lighter pass
      line(mc, r, 0, 0);
    });
    const tint = document.createElement("canvas");
    tint.width = W;
    tint.height = H;
    const tc = ctx2d(tint);
    tc.drawImage(mask, 0, 0);
    tc.globalCompositeOperation = "source-in";
    tc.fillStyle = paint;
    tc.fillRect(0, 0, W, H);

    // soaked into the plaster before it had a chance to dry
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.filter = "blur(7px)";
    ctx.drawImage(tint, 0, 0);
    ctx.globalAlpha = 0.68;
    ctx.filter = "blur(2px)";
    ctx.drawImage(tint, 0, 0);
    ctx.restore();

    // the runs: at the low edge of a stroke, gravity takes its cut
    const px = mc.getImageData(0, 0, W, H).data;
    const solid = (x: number, y: number) =>
      (px[(y * W + x) * 4 + 3] ?? 0) > 140;
    /* Every column's lowest stroke, and the headroom under it: a run
       that would reach the line below stops short of it instead, so
       the rule under a heading never bleeds into the words. */
    // [x, the foot of the stroke, and the headroom under it if known]
    const feet: [number, number, number?][] = [];
    for (let x = 4; x < W - 4; x += 4)
      for (let y = H - 1; y >= 0; y--)
        if (solid(x, y)) {
          feet.push([x, y]);
          break;
        }
    for (let x = 4; x < W - 4; x += 4)
      for (let y = 0; y < H; y++)
        if (solid(x, y)) {
          let y2 = y;
          while (y2 < H && solid(x, y2)) y2++;
          let y3 = y2;
          while (y3 < H && !solid(x, y3)) y3++;
          if (y3 < H) feet.push([x, y2 - 1, y3 - y2]);
          break;
        }
    ctx.fillStyle = paint;
    feet.forEach(([x, y, room]) => {
      if (Math.random() > 0.038) return;
      const len = Math.min(
        rnd(8, H * 0.3),
        room === undefined ? Infinity : Math.max(4, room - 8),
      ),
        w0 = rnd(2.6, 5.4), // how much ink the stroke had to give
        drift = rnd(-4, 4), // a wall is never quite plumb
        x1 = x + drift;
      ctx.globalAlpha = rnd(0.72, 0.95);
      ctx.beginPath();
      ctx.moveTo(x - w0 / 2, y);
      ctx.bezierCurveTo(
        x - w0 * 0.4,
        y + len * 0.45,
        x1 - 1.2,
        y + len * 0.78,
        x1 - 0.9,
        y + len,
      );
      ctx.lineTo(x1 + 0.9, y + len);
      ctx.bezierCurveTo(
        x1 + 1.2,
        y + len * 0.78,
        x + w0 * 0.4,
        y + len * 0.45,
        x + w0 / 2,
        y,
      );
      ctx.closePath();
      ctx.fill();
      ctx.beginPath(); // the bead that gathers where a run stops
      ctx.arc(x1, y + len, rnd(1.4, 2.8), 0, 7);
      ctx.fill();
    });

    ctx.globalAlpha = 1; // and the stroke itself, over its own bleed
    ctx.drawImage(tint, 0, 0);
    ctx.globalAlpha = 0.55; // a second pass, where the hand slowed
    ctx.drawImage(tint, 0, 0);

    // overspray: the mist thrown around everything a can writes
    for (let y = 0; y < H; y += 2)
      for (let x = 0; x < W; x += 2) {
        if (!solid(x, y) || Math.random() > 0.02) continue;
        const a = rnd(0, 6.28),
          d = rnd(3, 26);
        ctx.globalAlpha = clamp(0.6 - d * 0.018, 0.06, 0.6);
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(a) * d,
          y + Math.sin(a) * d,
          rnd(0.3, 1.1),
          0,
          7,
        );
        ctx.fill();
      }
    ctx.globalAlpha = 1;
  } else {
    // one stroke of paint: pressed in, filled, then lit along the top
    lay.forEach((r) => {
      ctx.fillStyle = "rgba(56,42,26,.5)";
      line(ctx, r, 1.6, 3.2);
      ctx.fillStyle = "rgba(255,247,231,.26)";
      line(ctx, r, -1.6, -2.6);
      ctx.fillStyle = r.faint ? paint + "c4" : paint;
      line(ctx, r, 0, 0);
    });
  }

  // the plaster eats the paint back: grain punched out of the
  // letters — less of it for ink, which soaks in rather than sits
  const wear = p.ink ? 0.35 : 1;
  ctx.globalCompositeOperation = "destination-out";
  speckle(ctx, W, H, Math.round(W * H * 0.015 * wear), 0.6, true);
  for (let i = 0; i < 16 * wear; i++) {
    // wider bald patches where the wall has taken the most weather
    const g = ctx.createRadialGradient(
      rnd(0, W),
      rnd(0, H),
      2,
      rnd(0, W),
      rnd(0, H),
      rnd(30, 130),
    );
    g.addColorStop(0, `rgba(0,0,0,${0.38 * wear})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, ratio };
}


/* The paint a heading is written in: what the author mixed, or the
   room's own. With one exception — nobody can write charcoal on
   charcoal. A deck written for the plaster room paints its headings
   dark, and hung in the night room those would vanish into the wall;
   so a paint darker than the wall it is on is written in the room's
   chalk instead. Everything lighter than the wall is kept as chosen. */
function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n) || hex.length < 7) return 0.5;
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function paintFor(chosen?: string) {
  const room = currentRoom();
  if (!chosen) return room.paper.paint;
  const wall = luminance(room.plaster.base);
  // on a dark wall, a paint that would be lost in it becomes chalk
  if (wall < 0.4 && luminance(chosen) < wall + 0.15) return room.paper.paint;
  return chosen;
}
