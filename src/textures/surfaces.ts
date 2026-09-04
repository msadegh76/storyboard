/* Tape, plaster and floorboards — the surfaces around the paper. */

import { THREE } from "../vendor.js";
import { rnd } from "../util.js";
import { ctx2d, speckle } from "./draw.js";

export function makeTapeTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = ctx2d(c);
  ctx.clearRect(0, 0, 256, 96);
  ctx.beginPath();
  ctx.moveTo(8, rnd(4, 10));
  for (let y = 8; y <= 88; y += 10) ctx.lineTo(rnd(2, 12), y);
  ctx.lineTo(rnd(244, 254), 88);
  for (let y = 88; y >= 8; y -= 10) ctx.lineTo(rnd(244, 254), y);
  ctx.closePath();
  ctx.fillStyle = "rgba(230,215,180,.92)";
  ctx.fill();
  ctx.clip();
  speckle(ctx, 256, 96, 160, 0.1, true);
  ctx.strokeStyle = "rgba(120,95,60,.12)";
  for (let i = 0; i < 6; i++) {
    const y = rnd(8, 88);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + rnd(-6, 6));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWallTexture() {
  const S = 1024,
    c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = ctx2d(c);
  ctx.fillStyle = "#cbbfab";
  ctx.fillRect(0, 0, S, S);
  // tonal blotches, drawn wrapped so the texture tiles seamlessly
  for (let i = 0; i < 26; i++) {
    const bx = Math.random() * S,
      by = Math.random() * S,
      r = rnd(140, 420);
    const col =
      i % 3 ? "rgba(255,248,232,.10)" : "rgba(120,100,70,.10)";
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(
          bx + ox,
          by + oy,
          20,
          bx + ox,
          by + oy,
          r,
        );
        g.addColorStop(0, col);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
      }
  }
  speckle(ctx, S, S, 5200, 0.08, true);
  speckle(ctx, S, S, 2600, 0.07, false);
  // hairline cracks (kept away from tile edges)
  ctx.strokeStyle = "rgba(90,72,50,.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    let x = rnd(S * 0.2, S * 0.8),
      y = rnd(S * 0.1, S * 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += rnd(-22, 22);
      y += rnd(6, 22);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // architectural seams (stone block joints), slightly irregular
  const seam = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(80,64,44,.38)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const n = 8;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      ctx.lineTo(
        x0 + (x1 - x0) * t + rnd(-2, 2),
        y0 + (y1 - y0) * t + rnd(-2, 2),
      );
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,248,230,.30)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0 + 3, y0 + 4);
    ctx.lineTo(x1 + 3, y1 + 4);
    ctx.stroke();
  };
  const H1 = S * 0.3,
    H2 = S * 0.63;
  seam(0, 0, S, 0);
  seam(0, S, S, S); // tile borders become block joints
  seam(0, H1, S, H1);
  seam(0, H2, S, H2);
  seam(S * 0.34, 0, S * 0.34, H1);
  seam(S * 0.7, 0, S * 0.7, H1);
  seam(S * 0.18, H1, S * 0.18, H2);
  seam(S * 0.55, H1, S * 0.55, H2);
  seam(S * 0.86, H1, S * 0.86, H2);
  seam(S * 0.4, H2, S * 0.4, S);
  seam(S * 0.74, H2, S * 0.74, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // bump map: grayscale copy
  const b = document.createElement("canvas");
  b.width = b.height = S;
  const bc = ctx2d(b);
  bc.filter = "grayscale(1) contrast(1.25)";
  bc.drawImage(c, 0, 0);
  const bump = new THREE.CanvasTexture(b);
  return { tex, bump };
}

export function makeWoodTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = ctx2d(c);
  ctx.fillStyle = "#a57f55";
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(${(60 + Math.random() * 40) | 0},${(42 + Math.random() * 30) | 0},20,${rnd(0.05, 0.2)})`;
    ctx.lineWidth = rnd(0.6, 2.4);
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32)
      ctx.lineTo(x, y + Math.sin(x * 0.02 + y) * 4 + rnd(-2, 2));
    ctx.stroke();
  }
  speckle(ctx, 512, 256, 500, 0.08, true);
  // floorboards: per-plank tint, gap lines, staggered end joints
  const PL = 64;
  for (let r = 0; r < 4; r++) {
    ctx.fillStyle = `rgba(${r % 2 ? 255 : 40},${r % 2 ? 230 : 26},${r % 2 ? 190 : 10},${rnd(0.03, 0.07)})`;
    ctx.fillRect(0, r * PL, 512, PL);
    ctx.strokeStyle = "rgba(35,22,10,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, r * PL + 0.5);
    ctx.lineTo(512, r * PL + 0.5);
    ctx.stroke();
    const jx = (((r * 197) % 512) + 512) % 512; // staggered, tile-safe
    ctx.beginPath();
    ctx.moveTo(jx, r * PL);
    ctx.lineTo(jx, r * PL + PL);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,240,215,.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, r * PL + 2);
    ctx.lineTo(512, r * PL + 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

