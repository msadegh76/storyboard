/* Small shared helpers. Nothing here knows about the wall. */

/** A viewer who has asked for less movement gets a still wall. */
export const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) =>
  Math.min(b, Math.max(a, v));
export const el = (id: string) => document.getElementById(id);

/** Lighten (f > 1) or darken (f < 1) a #rrggbb colour. */
export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16),
    r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const m = (v: number) => clamp(Math.round(v * f), 0, 255);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/* A small deterministic generator (mulberry32).

   The wall's composition — how far each card is tilted — is drawn from
   a seeded stream rather than Math.random, so the same deck lays out
   the same way on every load. That makes a screenshot reproducible and
   a regression visible. The grain in the paper is still free-running:
   nobody can see the difference, and nobody needs to. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold a string into a 32-bit seed, so a deck can be seeded by name. */
export function hashSeed(str: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
