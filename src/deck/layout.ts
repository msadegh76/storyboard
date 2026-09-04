/* Where everything hangs.

   Two passes, and an author can stop after either of them.

   `placeCards` runs first, before anything is drawn: it reads the deck
   the way a board is read — left to right, then down a row — and gives
   every card a spot. A card that was authored with an `x` and a `y`
   keeps them and the flow parts around it.

   `spaceOutCards` runs last, after the cards exist and their real
   heights are known, and pushes apart anything that still overlaps.
   That is what lets a hand-placed wall be approximate: pin the cards
   roughly where you want them and this opens the gaps. A mural is
   immovable in that pass — the paper moves around the writing, never
   the other way. */

import { clamp } from "../util.js";
import {
  MIN_GAP,
  GROUP_GAP,
  BOARD_W,
  ROW_TOP,
  ROW_PITCH,
  BOARD_BOTTOM,
  boardAspect,
  MAX_ROWS,
  FLOOR_Y,
} from "../config.js";
import { cards } from "../scene/card.js";
import { STORY } from "./state.js";
import type { Beat, Promise_ } from "./types.js";

/* ------------------------------------------------------------------
   Pass one: read the deck onto the board
------------------------------------------------------------------ */

/* An estimate of how tall a card will end up, in wall units. The real
   height is not known until the paper is drawn, so this is only good
   enough to choose a row — the second pass fixes what it gets wrong. */
function guessHeight(p: Promise_) {
  if (p.ratio) return p.w * p.ratio;
  if (p.type === "photo") return p.w * 1.2;
  return p.w * 1.15;
}

/**
 * Give every promise an x and a y. Anything already carrying both is
 * left exactly where the author put it.
 *
 * @param promises the normalized deck
 * @param story the resolved stops, in order
 */
export function placeCards(promises: Promise_[], story: Beat[]) {
  // group by stop, so cards that are read together are placed together
  const groups = story
    .filter((b: Beat) => !b.overview)
    .map((b: Beat) => promises.filter((p) => p.slide === b.slide))
    .filter((g) => g.length);

  /* A stop with a card the author pinned is anchored to it: whatever
     else the stop holds gathers beside that card rather than taking its
     place in the flow. Otherwise a card added to a hand-placed stop
     lands wherever the reading order has got to — a row or two away
     from the cards it is meant to be read with, and the stop frames as
     most of the wall. */
  const pinned = (p: Promise_) => p.x != null && p.y != null;
  for (const g of groups) {
    const anchors = g.filter(pinned);
    if (!anchors.length || anchors.length === g.length) continue;
    const loose = g.filter((p) => !pinned(p));
    const span =
      loose.reduce((a, p) => a + p.w, 0) + GROUP_GAP * loose.length;
    const right = Math.max(...anchors.map((p) => (p.x ?? 0) + p.w / 2));
    const left = Math.min(...anchors.map((p) => (p.x ?? 0) - p.w / 2));
    // to the right of the anchor if there is wall for it, else the left
    const toRight = right + span <= bounds.right || left - span < bounds.left;
    let cx = toRight ? right + GROUP_GAP : left - span;
    const y = anchors[0]?.y ?? 0;
    loose.forEach((p, j) => {
      if (p.x == null) p.x = cx + p.w / 2;
      if (p.y == null) p.y = y + ((j % 2) - 0.5) * 0.9;
      cx += p.w + GROUP_GAP;
    });
  }

  const stops = groups.filter((g) => !g.every(pinned));
  if (!stops.length) return;

  const widthsOf = (g: Promise_[]) => g.map((p) => p.w);
  const spanOf = (g: Promise_[]) =>
    widthsOf(g).reduce((a, w) => a + w, 0) + GROUP_GAP * (g.length - 1);

  const spans = stops.map(spanOf);
  const total = spans.reduce((a, s) => a + s, 0) + MIN_GAP * (stops.length - 1);

  /* How many rows to read the deck onto. A wall wants to be about as
     wide as the eye is: laid out in one long row a short deck frames as
     a thin strip of cards with empty plaster above and below it, and in
     one tall column a long deck frames as a ribbon. So try every row
     count and keep the one whose board comes out closest to the shape
     of a screen — measured as a ratio, so being twice too wide and
     twice too tall are judged the same amount of wrong. */
  const widest = Math.max(...spans);
  // the tallest card is what makes a board taller than its rows are
  const tall = Math.max(...promises.map(guessHeight));
  const shape = (n: number) => {
    const w = clamp(total / n, widest, BOARD_W);
    const h = (n - 1) * ROW_PITCH + tall;
    return Math.abs(Math.log(w / h / boardAspect()));
  };
  let rows = 1;
  for (let n = 2; n <= MAX_ROWS; n++) if (shape(n) < shape(rows)) rows = n;

  // never narrower than the widest single stop — a stop is not split
  const boardW = clamp(total / rows, widest, BOARD_W);

  /* How many rows the reading will actually take at that width. The
     count above chose the width; a stop is never split, so the rows
     that come out of filling it can be more than it. */
  let rowsUsed = 1;
  {
    let x = -boardW / 2;
    for (const span of spans) {
      if (x + span > boardW / 2 && x > -boardW / 2) {
        rowsUsed++;
        x = -boardW / 2;
      }
      x += span + MIN_GAP;
    }
  }

  /* Hang the whole board about the middle of the wall — unless the
     last row would then be under the floor. The plaster goes up a long
     way and the floor does not go down, so a long deck starts higher
     instead: the bottom row is held above the skirting, and the rows
     above it climb from there. */
  const lowest = FLOOR_Y + 1.6 + tall / 2 + 1;
  const top = Math.max(
    Math.min(ROW_TOP, ((rowsUsed - 1) * ROW_PITCH) / 2 + ROW_PITCH / 2),
    lowest + (rowsUsed - 1) * ROW_PITCH,
  );

  let x = -boardW / 2, // the left margin of the current row
    row = 0;

  for (let i = 0; i < stops.length; i++) {
    const group = stops[i];
    const span = spans[i];
    if (!group || span == null) continue;
    const widths = widthsOf(group);

    // a stop is never split across two rows: if it will not fit in what
    // is left of this row, it starts the next one
    if (x + span > boardW / 2 && x > -boardW / 2) {
      row++;
      x = -boardW / 2;
    }

    const y = top - row * ROW_PITCH;
    let cx = x;
    group.forEach((p: Promise_, j: number) => {
      const wj = widths[j] ?? p.w;
      if (p.x == null) p.x = cx + wj / 2;
      if (p.y == null) {
        // a row reads as a row, not as a ruler: each card sits a little
        // off the line, the way a hand pins one
        const drift = ((j % 2) - 0.5) * 0.9;
        p.y = y + drift;
      }
      cx += wj + GROUP_GAP;
    });

    x += span + MIN_GAP;
  }

  // the board grew downward as rows were used; tell the second pass how
  // far it may push a card before it runs out of wall
  const tallest = Math.max(...promises.map(guessHeight), 0);
  bounds.top = top + tallest;
  // ...but never through the skirting board, whatever the deck's length
  bounds.bottom = Math.max(
    FLOOR_Y + 1.6,
    Math.min(BOARD_BOTTOM, top - row * ROW_PITCH - tallest) - 1,
  );
}

/* How far a card may be pushed before it runs out of wall. The top and
   the sides are fixed by the room; the bottom follows the deck, so a
   long wall simply reaches further down. */
const bounds = { left: -29.5, right: 29.5, top: 20.5, bottom: -19.5 };

/* ------------------------------------------------------------------
   Pass two: open the gaps
------------------------------------------------------------------ */
export function spaceOutCards() {
  const boxes = cards.map((g) => {
    const u = g.userData;
    const c = Math.abs(Math.cos(u.baseRot)),
      sn = Math.abs(Math.sin(u.baseRot));
    return {
      g,
      fixed: u.mural, // painted on: the paper moves around it
      w: u.w * c + u.h * sn, // footprint of the tilted card
      h: u.h * c + u.w * sn,
      // promises that appear together in one stop stay close enough
      // to read as a pair, so they only need the smaller gap
      stop: STORY.findIndex((b) => (b._gs ?? []).indexOf(g) > -1),
    };
  });
  for (let pass = 0; pass < 300; pass++) {
    let hits = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        if (!a || !b) continue;
        if (a.fixed && b.fixed) continue; // neither can give way
        const dx = b.g.position.x - a.g.position.x,
          dy = b.g.position.y - a.g.position.y;
        const gap =
          a.stop > -1 && a.stop === b.stop ? GROUP_GAP : MIN_GAP;
        const ox = (a.w + b.w) / 2 + gap - Math.abs(dx),
          oy = (a.h + b.h) / 2 + gap - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        hits++;
        // separate along whichever axis they are least deep into
        // a fixed neighbour gives nothing, so the other takes it all
        const share = a.fixed || b.fixed ? 2 : 1;
        if (ox < oy) {
          const push = (ox / 2 + 0.002) * (dx < 0 ? -1 : 1) * share;
          if (!a.fixed) a.g.position.x -= push;
          if (!b.fixed) b.g.position.x += push;
        } else {
          const push = (oy / 2 + 0.002) * (dy < 0 ? -1 : 1) * share;
          if (!a.fixed) a.g.position.y -= push;
          if (!b.fixed) b.g.position.y += push;
        }
      }
    }
    boxes.forEach(({ g, w, h, fixed }) => {
      if (fixed) return;
      g.position.x = clamp(
        g.position.x,
        bounds.left + w / 2,
        bounds.right - w / 2,
      );
      g.position.y = clamp(
        g.position.y,
        bounds.bottom + h / 2,
        bounds.top - h / 2,
      );
    });
    if (!hits) break;
  }
}
