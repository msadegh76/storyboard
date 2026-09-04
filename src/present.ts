/* The presenter window.

   What the room sees is the wall. What you see is this: the words on
   the stop you are on, what you meant to say about them, the stop that
   comes next, and how long you have been talking.

   It knows nothing about the scene. Everything it shows arrives over a
   BroadcastChannel from the window holding the wall, which is why this
   page loads in a blink while the other one is still building
   textures — and why the arrow keys here have to be sent back rather
   than acted on, because the deck lives over there.

   Opened with `P` from the wall. See src/ui/present.ts for that side. */

import { CHANNEL } from "./present-protocol.js";
import type {
  FromPresenter,
  PresentDeck,
  ToPresenter,
} from "./present-protocol.js";

const el = (id: string) => document.getElementById(id);
const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text?: string,
) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const channel = new BroadcastChannel(CHANNEL);
const send = (m: FromPresenter) => channel.postMessage(m);

let deck: PresentDeck | null = null;
let at = -1;

/* ------------------------------------------------------------------
   The clock
------------------------------------------------------------------ */

/* Two numbers a presenter actually watches: how long the whole thing
   has run, and how long they have been on this one stop. The second is
   what catches you dwelling. */
let startedAt = 0;
let stopAt = 0;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function tick() {
  const now = Date.now();
  const e = el("elapsed");
  if (e) e.textContent = startedAt ? mmss(now - startedAt) : "0:00";
  const o = el("onstop");
  if (o) o.textContent = stopAt ? mmss(now - stopAt) : "0:00";
  const c = el("clock");
  if (c)
    c.textContent = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
}
setInterval(tick, 1000);
tick();

/* ------------------------------------------------------------------
   One stop, read rather than looked at
------------------------------------------------------------------ */

function drawStop(into: HTMLElement, i: number, small: boolean) {
  into.replaceChildren();
  const stop = deck?.stops[i];
  if (!stop) {
    into.append(h("p", "waiting", small ? "End of the deck" : "The whole wall"));
    return;
  }

  if (small) into.append(h("h4", "", `Next · slide ${stop.slide}`));

  for (const c of stop.cards) {
    const card = h("article", c.type === "mural" ? "card mural" : "card");
    if (c.title) card.append(h(small ? "h4" : "h2", "", c.title));
    if (c.text) card.append(h("p", "", c.text));
    if (!small) {
      if (c.bullets?.length) {
        const ul = h("ul");
        for (const b of c.bullets) ul.append(h("li", "", b));
        card.append(ul);
      }
      if (c.image) card.append(h("p", "img", `Picture: ${c.image}`));
      if (c.foot) card.append(h("p", "foot", c.foot));
      /* The point of the whole window. Set apart from the card's own
         words, because one is what the room reads and the other is
         what only you can see. */
      if (c.say) card.append(h("p", "say", c.say));
    }
    into.append(card);
  }
}

function render() {
  const now = el("now");
  const next = el("next");
  if (!now || !next) return;

  if (!deck) return;
  el("deck")!.textContent = deck.title;

  if (at < 0) {
    now.replaceChildren(
      h("p", "waiting", "The wide shot — the whole wall, no stop."),
    );
    next.replaceChildren();
    drawStop(next, 0, true);
  } else {
    drawStop(now, at, false);
    drawStop(next, at + 1, true);
  }
  el("count")!.textContent =
    at < 0 ? `— / ${deck.stops.length}` : `${at + 1} / ${deck.stops.length}`;
}

/* ------------------------------------------------------------------
   Talking to the wall
------------------------------------------------------------------ */

channel.onmessage = (e: MessageEvent<ToPresenter>) => {
  const m = e.data;
  if (!m) return;
  if (m.t === "deck") {
    deck = m.deck;
    document.title = `${deck.title} — presenter`;
    render();
  } else if (m.t === "at") {
    if (m.at !== at) {
      stopAt = Date.now();
      // the clock starts when the talk does, not when this window opened
      if (!startedAt && m.at >= 0) startedAt = stopAt;
    }
    at = m.at;
    render();
    tick();
  }
};

// a window that has just opened — or just been reloaded — asks for it all
send({ t: "hello" });

el("prev")?.addEventListener("click", () => send({ t: "go", d: -1 }));
el("next-btn")?.addEventListener("click", () => send({ t: "go", d: 1 }));
el("reset")?.addEventListener("click", () => {
  startedAt = Date.now();
  stopAt = startedAt;
  tick();
});

/* The keys work here too. Someone presenting is looking at this window,
   not at the wall, and reaching for the other one to press an arrow is
   exactly the fumble this window exists to prevent. */
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
    e.preventDefault();
    send({ t: "go", d: 1 });
  } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
    e.preventDefault();
    send({ t: "go", d: -1 });
  } else if (e.key === "Home") {
    send({ t: "home" });
  }
});
