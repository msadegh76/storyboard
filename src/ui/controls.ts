/* How a viewer walks the wall: the arrow keys, and a click on it.

   Nothing here draws. It only moves the deck, hides it, or hands out a
   link to where it is standing. */

import { canvas } from "../scene/stage.js";
import { cardAt } from "../scene/pick.js";
import { ensureAudio } from "../scene/sound.js";
import { el } from "../util.js";
import {
  beats,
  storyAt,
  storyGo,
  storyNext,
  storyPrev,
  storyGoToSlide,
  hideHint,
  storyIndexFromHash,
} from "../deck/story.js";

/* Whether the keystroke belongs to something being written in.

   The walk listens on the window, so without this every space typed
   into a field would also step the deck forward and every arrow would
   move it. Nothing in a presented deck takes typing — this is here for
   the dev-mode editor, and for anything else that ever grows a field. */
export const typing = (t: EventTarget | null) => {
  const n = t as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    n.isContentEditable
  );
};

/* Something else may want a click on the wall.

   A click steps the deck forward, which is right for a viewer and
   wrong for someone dragging a card into place. The dev-mode editor
   registers here while it is open; nothing else ever does. */
let claim: (() => boolean) | null = null;
export const claimPointer = (fn: () => boolean) => (claim = fn);

/* ------------------------------------------------------------------
   Saying something without leaving the wall
------------------------------------------------------------------ */

let toastT: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  const box = el("toast");
  if (!box) return;
  box.textContent = msg;
  box.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => box.classList.remove("show"), 2200);
}

/* Take the wall away.

   Every presentation tool has this key, because sooner or later the
   room has to look at the person rather than the slide. */
function blackout() {
  const on = document.body.classList.toggle("blacked");
  document.body.setAttribute("aria-hidden", on ? "true" : "false");
  if (!on) document.body.removeAttribute("aria-hidden");
}

/* The deck as text, brought out from behind the wall.

   It is built on every load for screen readers and for anything that
   crawls the page, and it holds the narration too — so it is already
   the answer to "can you send me the slides". It only had to be
   reachable. */
function transcript() {
  const shown = document.body.classList.toggle("reading");
  if (shown) el("transcript")?.scrollTo(0, 0);
}

/* A phone has no arrow keys. A swipe walks the wall, a tap near the
   left edge goes back — a tap anywhere else already goes forward — and
   the hint says so instead of naming keys nobody has. */
const SWIPE_PX = 40;
const BACK_EDGE = 0.22; // of the width

function touchHint() {
  const hint = el("hint");
  if (!hint || !matchMedia("(pointer: coarse)").matches) return;
  const say = (text: string) => {
    const s = document.createElement("span");
    s.textContent = text;
    return s;
  };
  const dot = () => {
    const e = document.createElement("em");
    e.textContent = "·";
    return e;
  };
  hint.replaceChildren(
    say("swipe to walk the wall"),
    dot(),
    say("tap the left edge to go back"),
    dot(),
    say("tap a card to open it"),
  );
}

export function initControls() {
  touchHint();

  addEventListener("keydown", (e) => {
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

    if (
      e.key === "ArrowRight" ||
      e.key === "ArrowDown" ||
      e.key === "PageDown" ||
      e.key === " " ||
      e.key === "Enter"
    ) {
      e.preventDefault();
      storyNext();
    } else if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowUp" ||
      e.key === "PageUp"
    ) {
      e.preventDefault();
      storyPrev();
    } else if (e.key === "Home") {
      storyGo(0);
    } else if (e.key === "End") {
      storyGo(beats.length - 1);
    } else if (e.key === "Escape") {
      // one key backs out of whatever is over the wall, then off it
      if (document.body.classList.contains("reading")) transcript();
      else if (document.body.classList.contains("blacked")) blackout();
      else storyGo(0);
    } else if (e.key === "b" || e.key === "B") {
      blackout();
    } else if (e.key === "t" || e.key === "T") {
      transcript();
    } else if (e.key === "s" || e.key === "S") {
      navigator.clipboard
        .writeText(location.href)
        .then(() => toast("Link to this stop copied"))
        .catch(() => toast(location.href));
    } else return;
    hideHint();
  });

  /* Someone pasting a link into the address bar of a deck that is
     already open expects to be taken there, not ignored. Our own
     replaceState calls do not fire this, so there is no loop. */
  addEventListener("hashchange", () => {
    storyGo(storyIndexFromHash());
    hideHint();
  });

  /* A click on the wall.

     On bare plaster it steps forward, the same as the right arrow. On a
     card it goes to that card's stop — which is the one thing this
     format can do that a stack of slides cannot: in the wide shot the
     whole deck is in front of you, so "show me that chart again" is a
     thing you point at rather than a slide number you have to remember.

     Only for a press that started here, so a stray pointerup cannot
     skip a stop, and only if it barely moved, so a drag is not a click. */
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    ensureAudio();
    down = { x: e.clientX, y: e.clientY };
  });
  addEventListener("pointerup", (e) => {
    const d = down;
    down = null;
    if (claim?.()) return;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // a finger drawn across the wall, mostly sideways: a step, not a click
    if (e.pointerType === "touch" && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) storyNext();
      else storyPrev();
      hideHint();
      return;
    }
    if (e.target !== canvas) return;
    if (Math.hypot(dx, dy) >= 6) return;
    const hit = cardAt(e.clientX, e.clientY);
    const slide = hit?.userData.p.slide;
    const here = beats[storyAt()]?.slide;
    /* On a phone the framed card fills the screen, so the left edge
       is a control before it is a card. And a tap on the card you are
       already standing on is a step, not a request to stand there. */
    if (e.pointerType === "touch" && e.clientX < innerWidth * BACK_EDGE) storyPrev();
    else if (slide != null && slide !== here) storyGoToSlide(slide);
    else storyNext();
    hideHint();
  });

  /* A card is worth pointing at, so it looks like it. Held to one test
     a frame: a pointer reports far more often than that, and each test
     is a ray against every card on the wall. */
  let hover: { x: number; y: number } | null = null;
  canvas.addEventListener("pointermove", (e) => {
    if (hover) return void (hover = { x: e.clientX, y: e.clientY });
    hover = { x: e.clientX, y: e.clientY };
    requestAnimationFrame(() => {
      const at = hover;
      hover = null;
      if (!at || claim?.()) return;
      canvas.style.cursor = cardAt(at.x, at.y) ? "pointer" : "default";
    });
  });
}
