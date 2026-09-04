/* Photo: a capture pinned to the wall, matted like a print. */

import { THREE } from "../vendor.js";
import { SS } from "../config.js";
import { clamp, rnd } from "../util.js";
import type { Promise_ } from "../deck/types.js";
import { ctx2d, speckle } from "./draw.js";

/* The mount a capture is laid into: a margin all round, and a chin
   below it. The picture window follows the picture's own proportions,
   so a wide dashboard stays wide and a phone capture stays tall. A
   caption, if there is one, gets the chin made deeper for it — the
   picture keeps its size, and the card grows. */
const CAPTION_H = 40;
function mount(img?: HTMLImageElement, caption?: string) {
  const W = 512,
    m = img ? 20 : 34,
    // a screenshot needs no polaroid chin, unless something is written on it
    foot = (img ? 24 : 86) + (caption ? CAPTION_H : 0),
    pw = W - m * 2,
    ph = Math.round(
      pw * clamp(img ? img.height / img.width : 1.05, 0.42, 2.25),
    );
  return { W, m, foot, pw, ph, H: ph + m * 2 + foot };
}

/* How tall a photo card ends up, per unit of its width. The layout
   reads this before anything is drawn, so a card can be given the width
   that makes its picture the right size on the wall. */
export function photoRatio(img?: HTMLImageElement, caption?: string) {
  const q = mount(img, caption);
  return q.H / q.W;
}

/* The caption: one line on the chin, written by hand like a label
   under a print, shrunk until it fits the width of the picture. */
function drawCaption(
  ctx: CanvasRenderingContext2D,
  caption: string | undefined,
  m: number,
  pw: number,
  ph: number,
  foot: number,
) {
  if (!caption) return;
  ctx.save();
  let size = 26;
  ctx.font = `600 ${size}px Caveat`;
  while (size > 14 && ctx.measureText(caption).width > pw - 8) {
    size -= 1;
    ctx.font = `600 ${size}px Caveat`;
  }
  ctx.fillStyle = "rgba(43, 36, 28, 0.86)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // centred in the chin: below the picture window, above the bottom edge
  ctx.fillText(caption, m + pw / 2, m + ph + (m + foot) / 2);
  ctx.restore();
}

export function makePhotoTexture(p: Promise_) {
  const img = p.userImage;
  const { W, m, pw, ph, H, foot } = mount(img, p.caption);
  const ratio = H / W;
  // a capture deserves its own pixels: the paper is laid out in the
  // same 512-wide units as every other card, but the canvas behind it
  // is scaled up until the picture window is close to the screenshot's
  // native width — otherwise a 3590px dashboard is thrown away at 944
  // and its UI text turns to mush. two ceilings keep the GPU honest:
  // no texture past 4096 on a side, and no texture past ~3.5M pixels,
  // which is what stops the tall phone captures from eating the budget
  let ss = SS;
  if (img) {
    ss = Math.max(SS, Math.min(img.width, 1600) / pw);
    ss = Math.min(ss, 4096 / W, 4096 / H);
    const over = (W * ss * (H * ss)) / 3.5e6;
    if (over > 1) ss = Math.max(SS, ss / Math.sqrt(over));
  }
  const c = document.createElement("canvas");
  c.width = Math.round(W * ss);
  c.height = Math.round(H * ss);
  const ctx = ctx2d(c);
  ctx.scale(ss, ss);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#faf7f0";
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 300, 0.04, true);
  ctx.save();
  ctx.translate(m, m);
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  if (img) {
    // the frame already matches the image, so nothing is cropped
    ctx.drawImage(img, 0, 0, pw, ph);
  } else if (p.photo === "beach") {
    let g = ctx.createLinearGradient(0, 0, 0, ph);
    g.addColorStop(0, "#b9d3d8");
    g.addColorStop(0.55, "#e8ddc4");
    g.addColorStop(1, "#dcc9a3");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, pw, ph);
    ctx.fillStyle = "#7fa8a4";
    ctx.fillRect(0, ph * 0.42, pw, ph * 0.2);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(
        rnd(0, pw * 0.5),
        ph * 0.44 + i * ph * 0.045,
        rnd(70, 190),
        3,
      );
    }
    ctx.fillStyle = "#e6d5ae";
    ctx.beginPath();
    ctx.moveTo(0, ph * 0.62);
    ctx.quadraticCurveTo(pw * 0.5, ph * 0.55, pw, ph * 0.66);
    ctx.lineTo(pw, ph);
    ctx.lineTo(0, ph);
    ctx.closePath();
    ctx.fill();
  } else {
    // mountain
    let g = ctx.createLinearGradient(0, 0, 0, ph);
    g.addColorStop(0, "#ccd8da");
    g.addColorStop(0.6, "#ece1c6");
    g.addColorStop(1, "#e7dcbe");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, pw, ph);
    ctx.fillStyle = "rgba(245,235,205,.9)";
    ctx.beginPath();
    ctx.arc(pw * 0.72, ph * 0.24, 34, 0, 7);
    ctx.fill();
    const ridge = (base: number, color: string, amp: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, base);
      for (let x = 0; x <= pw; x += 26)
        ctx.lineTo(
          x,
          base - Math.abs(Math.sin(x * 0.013 + base)) * amp - rnd(0, 8),
        );
      ctx.lineTo(pw, ph);
      ctx.lineTo(0, ph);
      ctx.closePath();
      ctx.fill();
    };
    ridge(ph * 0.52, "#8b9385", 60);
    ridge(ph * 0.66, "#5f6a58", 52);
    ridge(ph * 0.82, "#95a06b", 34);
    ctx.fillStyle = "#d8cfa6";
    ctx.beginPath();
    ctx.moveTo(pw * 0.42, ph);
    ctx.quadraticCurveTo(pw * 0.5, ph * 0.8, pw * 0.62, ph * 0.72);
    ctx.lineTo(pw * 0.66, ph * 0.72);
    ctx.quadraticCurveTo(pw * 0.56, ph * 0.82, pw * 0.52, ph);
    ctx.closePath();
    ctx.fill();
  }
  // vignette + grain — only on the illustrated photographs; a UI
  // capture treated this way just looks damaged
  if (img) {
    ctx.restore();
    ctx.strokeStyle = "rgba(90,70,45,.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(m, m, pw, ph);
    drawCaption(ctx, p.caption, m, pw, ph, foot);
    const t2 = new THREE.CanvasTexture(c);
    t2.colorSpace = THREE.SRGBColorSpace;
    t2.anisotropy = 8;
    return { tex: t2, ratio };
  }
  const v = ctx.createRadialGradient(
    pw / 2,
    ph / 2,
    ph * 0.3,
    pw / 2,
    ph / 2,
    ph * 0.75,
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(60,45,25,.18)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, pw, ph);
  speckle(ctx, pw, ph, 400, 0.05, true);
  ctx.restore();
  ctx.strokeStyle = "rgba(90,70,45,.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(m, m, pw, ph);
  drawCaption(ctx, p.caption, m, pw, ph, foot);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, ratio };
}

