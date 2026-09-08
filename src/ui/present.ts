/* The wall's side of the presenter window.

   A talk needs two screens showing different things: the wall goes to
   the room, and what you meant to say goes to you. So `P` opens a
   second window, and the two keep in step over a BroadcastChannel —
   same origin, no server, nothing to configure.

   The channel carries the deck itself rather than a pointer into it,
   so the presenter window never has to load the scene, the textures or
   three.js. It is a page of text about a page of pictures.

   It also carries the walk both ways. A presenter looks at the notes,
   not at the wall, so the arrow keys have to work from over there. */

import { CHANNEL } from "../present-protocol.js";
import type { PresentDeck, ToPresenter, FromPresenter } from "../present-protocol.js";
import { promises } from "../deck/state.js";
import { presenterUrl } from "../deck/source.js";
import {
  beats,
  storyAt,
  storyGo,
  storyNext,
  storyPrev,
  storyGoToSlide,
  onStoryMove,
} from "../deck/story.js";

export type {
  PresentDeck,
  PresentStop,
  ToPresenter,
  FromPresenter,
} from "../present-protocol.js";

const numbered = () => beats.filter((b) => !b.overview);

function deckForPresenter(): PresentDeck {
  return {
    title: document.title,
    stops: numbered().map((b) => ({
      slide: b.slide ?? 0,
      cards: promises
        .filter((p) => p.slide === b.slide)
        .map((p) => ({
          type: p.type,
          title: p.title,
          text: p.text,
          bullets: p.bullets,
          foot: p.foot,
          image: p.image,
          say: p.say,
        })),
    })),
  };
}

/* Where the walk is, counted the way the wall counts it: the wide
   shots at the ends are not stops, so a deck of eighteen slides reads
   as eighteen from either window. */
function whereWeAre(): ToPresenter {
  const b = beats[storyAt()];
  const list = numbered();
  return {
    t: "at",
    slide: b && !b.overview ? (b.slide ?? null) : null,
    at: b && !b.overview ? list.indexOf(b) : -1,
    total: list.length,
  };
}

let channel: BroadcastChannel | null = null;
let window_: Window | null = null;

/** Open the presenter window, or bring back the one already open. */
function openPresenter() {
  if (window_ && !window_.closed) {
    window_.focus();
    return;
  }
  // beside a built deck, or at the root of a host — see deck/source.ts
  window_ = open(presenterUrl(), "storyboard-presenter", "width=1000,height=700");
}

/**
 * Keep a presenter window in step with the wall, and let it drive.
 *
 * Safe to call where there is no BroadcastChannel: the key simply does
 * nothing, rather than the deck failing to start.
 */
export function initPresent() {
  if (typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL);

  const send = (m: ToPresenter) => channel?.postMessage(m);

  channel.onmessage = (e: MessageEvent<FromPresenter>) => {
    const m = e.data;
    if (!m) return;
    if (m.t === "hello") {
      // a window that has just opened, or just reloaded, asking for it all
      send({ t: "deck", deck: deckForPresenter() });
      send(whereWeAre());
    } else if (m.t === "go") m.d > 0 ? storyNext() : storyPrev();
    else if (m.t === "goto") storyGoToSlide(m.slide);
    else if (m.t === "home") storyGo(0);
  };

  onStoryMove(() => send(whereWeAre()));

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      openPresenter();
    }
  });
}
