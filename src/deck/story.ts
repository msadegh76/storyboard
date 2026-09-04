/* The wall as a slide deck.

   A stop either frames the whole wall ("overview") or frames every
   card carrying that slide number, however many there are and
   whatever kind they are: the camera pulls back just far enough to
   hold them all in one shot. A stop made of murals frames exactly
   like one made of paper. */

import { gsap } from "../vendor.js";
import { clamp, el, REDUCED } from "../util.js";
import { FILL, STORY_LIFT } from "../config.js";
import { cam, camera } from "../scene/stage.js";
import { cards } from "../scene/card.js";
import { tap } from "../scene/sound.js";
import { STORY } from "./state.js";
import type { Beat } from "./types.js";
import type { CardGroup } from "../scene/card.js";

/** Where the camera is being asked to stand. */
interface Framing {
  tx: number;
  ty: number;
  tz: number;
}

export { STORY };

/* The stops that resolved against this wall. */
export let beats = STORY;
let storyIdx = 0,
  storyReady = false,
  storyTL: gsap.core.Tween | null = null,
  hintT: ReturnType<typeof setTimeout> | undefined;
const progressBar = el("progressBar"),
  hintEl = el("hint"),
  countEl = el("count");

/* How many stops carry words — the two wide shots at the ends are the
   whole wall and are not numbered, so a deck of eighteen slides reads
   as eighteen rather than twenty. */
const numbered = () => beats.filter((b) => !b.overview);

/** Every group a stop frames — empty for an overview. */
const groupsOf = (b: Beat): CardGroup[] => b._gs ?? [];
/** Every group the whole deck visits. */
const allGroups = () => beats.flatMap(groupsOf);

// vertical extent of the view at distance z, in wall units
const VIEW_K = () => 2 * Math.tan((camera.fov * Math.PI) / 360);

/* Bounding box of a set of promises in wall units, allowing for the
   tilt of each card so a corner never falls outside the shot. */
export function cardsBox(gs: CardGroup[]) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity,
    z = 0;
  gs.forEach((g: CardGroup) => {
    const u = g.userData;
    const c = Math.abs(Math.cos(u.baseRot)),
      sn = Math.abs(Math.sin(u.baseRot));
    const w = u.w * c + u.h * sn,
      h = u.h * c + u.w * sn;
    x0 = Math.min(x0, g.position.x - w / 2);
    x1 = Math.max(x1, g.position.x + w / 2);
    y0 = Math.min(y0, g.position.y - h / 2);
    y1 = Math.max(y1, g.position.y + h / 2);
    z = Math.max(z, u.baseZ);
  });
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0,
    h: y1 - y0,
    z,
  };
}

/* Fit every promise the deck visits, so the opening and closing
   stops show the same wall on a laptop and on a phone. */
function storyWide(): Framing {
  const gs = allGroups();
  if (!gs.length) return { tx: 0, ty: 0, tz: 40 };
  const k = VIEW_K(),
    b = cardsBox(gs),
    pad = 1.14;
  return {
    tx: clamp(b.cx, -16, 16),
    ty: clamp(b.cy, -16, 16),
    /* No upper stop worth having: the distance that holds the whole
       wall is arithmetic, and a window narrow enough to need 140 units
       needs them. Capping it here is what made a phone show half a
       board and call it the overview. The far plane is at 200. */
    tz: clamp(
      Math.max((b.w * pad) / (k * camera.aspect), (b.h * pad) / k),
      20,
      170,
    ),
  };
}

/* Fill the frame with the stop — one promise or several held
   together. Measured from where the cards end up, not where they
   rest: the stop lifts them off the wall, and that alone makes them
   read larger. */
export function storyFrame(gs: CardGroup[]): Framing {
  const k = VIEW_K(),
    b = cardsBox(gs);
  /* Far enough back to hold the stop, however narrow the window. The
     old ceilings were set for a laptop and quietly cropped every wide
     stop on a phone — a heading fifteen units across was shown through
     eight. */
  const d = clamp(
    Math.max(b.h / (k * FILL), b.w / (k * camera.aspect * FILL)),
    3.5,
    120,
  );
  return {
    tx: clamp(b.cx, -28, 28),
    ty: clamp(b.cy, -18.5, 18.5),
    tz: clamp(b.z + STORY_LIFT + d, 4, 124),
  };
}

/* Lift the stop's promise a little off the wall. Every other promise
   stays exactly as it is — the deck never fades the wall down. */
function storySpotlight(gs: CardGroup[]) {
  const heroes = gs.length ? gs : allGroups();
  cards.forEach((c) => {
    const on = heroes.indexOf(c) > -1;
    c.userData.tLift = on && !c.userData.mural ? STORY_LIFT : 0;
    c.userData.tGlow = on && c.userData.mural ? 1 : 0;
  });
}

/* Walk to the next stop: the camera holds its distance and travels
   along the wall, so the promises in between slide past. It never
   pulls back out and dives in again. */
function storyFly(beat: Beat) {
  if (storyTL) storyTL.kill();
  const gs = groupsOf(beat);
  const to = gs.length ? storyFrame(gs) : storyWide();
  const dist = Math.hypot(to.tx - cam.tx, to.ty - cam.ty);
  const zoom = Math.abs(to.tz - cam.tz); // only the overview stops zoom
  const dur = REDUCED
    ? 0
    : clamp(0.9 + dist * 0.075 + zoom * 0.022, 0.9, 3.4);
  storyTL = gsap.to(cam, {
    tx: to.tx,
    ty: to.ty,
    tz: to.tz,
    duration: dur,
    ease: "power2.inOut",
  });
}

/* Re-aim at the current stop without replaying the travel arc. */
export function storyReframe() {
  if (!storyReady) return;
  const b = beats[storyIdx];
  if (!b) return;
  const gs = groupsOf(b);
  const to = gs.length ? storyFrame(gs) : storyWide();
  if (storyTL) storyTL.kill();
  storyTL = gsap.to(cam, {
    tx: to.tx,
    ty: to.ty,
    tz: to.tz,
    duration: REDUCED ? 0 : 0.4,
    ease: "power2.out",
  });
}

export function hideHint() {
  clearTimeout(hintT);
  hintEl?.classList.remove("show");
}

export function storyGo(i: number) {
  i = clamp(i, 0, beats.length - 1);
  const b = beats[i];
  if (!b) return; // a deck with no stops has nowhere to go
  storyIdx = i;
  const gs = groupsOf(b);
  storySpotlight(gs);
  storyFly(b);
  if (progressBar)
    progressBar.style.width = ((i + 1) / beats.length) * 100 + "%";

  /* Say where we are, and put it in the address bar. `replaceState`
     rather than `pushState`: the back button should leave the deck, not
     walk it backwards one stop at a time. */
  if (countEl) {
    const list = numbered();
    const at = b.overview ? -1 : list.indexOf(b);
    countEl.textContent = at < 0 ? "" : `${at + 1} / ${list.length}`;
  }
  /* A wide shot is not a numbered stop, so it carries no fragment —
     but dropping back to the path alone would take the query with it,
     and a deck opened with ?debug would lose it the moment the walk
     reached either end. */
  const hash = b.overview ? "" : `#slide-${b.slide}`;
  if (location.hash !== hash)
    history.replaceState(
      null,
      "",
      hash || location.pathname + location.search,
    );

  tap(gs.length ? 1900 : 1300, 0.05, 0.03);
  movers.forEach((f) => f());
}

/** Where a slide number sits in the walk, or -1 if it is not on it. */
export const storyIndexOfSlide = (n: number) =>
  beats.findIndex((b) => !b.overview && b.slide === n);

/** Walk to a stop by its slide number rather than its place in the walk. */
export function storyGoToSlide(n: number) {
  const at = storyIndexOfSlide(n);
  if (at > -1) storyGo(at);
}

/* The stop a URL is pointing at, or the opening overview. Lets a deck
   be linked to at the slide someone actually wants to show. */
export function storyIndexFromHash(): number {
  const m = /^#slide-(\d+)$/.exec(location.hash);
  if (!m || !m[1]) return 0;
  const at = storyIndexOfSlide(Number(m[1]));
  return at < 0 ? 0 : at;
}
export const storyNext = () => storyGo(storyIdx + 1);
export const storyPrev = () => storyGo(storyIdx - 1);

/* Resolve each stop against the live wall. A promise that has been
   re-worded or removed simply drops out; a stop left with nothing
   drops out too, rather than playing as a blank. Runs before the
   layout pass, which needs to know which promises share a stop. */
export function resolveStory() {
  STORY.forEach((b) => {
    b._gs = b.overview
      ? []
      : cards.filter((c) => c.userData.p.slide === b.slide);
  });
  beats = STORY.filter((b) => b.overview || groupsOf(b).length);
}

/* Told whenever the deck arrives somewhere new. One list, no removal:
   the only subscriber is the dev-mode editor, which lives as long as
   the page does. */
const movers: (() => void)[] = [];
export const onStoryMove = (fn: () => void) => movers.push(fn);

/** The stop the deck is standing at. */
export const storyAt = () => storyIdx;

/** The cards that stop is made of. */
export function storyCards(): CardGroup[] {
  const b = beats[storyIdx];
  return b ? groupsOf(b) : [];
}

/* Take the wall as it now is, without walking anywhere.

   A card that has just been redrawn is a different group to the one the
   stops were resolved against, so the links have to be made again or
   the stop would spotlight — and frame — a card that is no longer on
   the wall. Everything else the walk does is deliberately left out:
   there is no travel arc and no tap, because this is not a move. The
   camera is only re-aimed when asked, so a card can be typed into
   without the shot creeping on every keystroke.

   @param reframe re-aim at the stop, once the editing has settled */
export function storyRefresh(reframe = false) {
  resolveStory();
  storyIdx = clamp(storyIdx, 0, beats.length - 1);
  const b = beats[storyIdx];
  if (!b) return;
  storySpotlight(groupsOf(b));
  if (reframe) storyReframe();
}

/* Open the deck: land on the first stop and show the hint for a while. */
export function storyStart() {
  storyReady = true;
  storyGo(storyIndexFromHash());
  hintEl?.classList.add("show");
  hintT = setTimeout(hideHint, 6000);
}
