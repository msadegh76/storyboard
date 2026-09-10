/* Boot: read the deck, fetch what it asks for, build the wall, open it.

   Every module below is imported for its effect on the scene, in the
   order the wall is assembled. The styles are not among them — they are
   linked from index.html so they block the first paint.

   The deck itself comes from deck/source.ts: the module beside this
   file, or the JSON a host wrote into the page. Nothing after that
   line knows which. */

import { el } from "./util.js";
import { fitCamera, lightRoom } from "./scene/stage.js";
import { buildRoom } from "./scene/room.js";
import { applyChrome } from "./rooms.js";
import "./scene/pointer.js";
import { buildCard } from "./scene/card.js";
import { loop } from "./scene/loop.js";
import { normalizeDeck, sizeCards, deckComplaints } from "./deck/schema.js";
import { setDeck, STORY, promises } from "./deck/state.js";
import { loadImages, releaseImages } from "./deck/images.js";
import { resolveStory, storyStart, storyReframe } from "./deck/story.js";
import { placeCards, spaceOutCards } from "./deck/layout.js";
import { loadSource, type DeckSource } from "./deck/source.js";
import { initControls } from "./ui/controls.js";
import { initReveal } from "./ui/reveal.js";
import { initPresent } from "./ui/present.js";
import { buildTranscript } from "./ui/transcript.js";
import { initDebug } from "./debug.js";

addEventListener("resize", () => {
  fitCamera();
  storyReframe();
});

/* A deck that will not parse is the author's mistake, not the viewer's:
   say what is wrong, on the loader, where they will actually see it. */
function fail(err: unknown) {
  console.error(err);
  const sub = el("loader")?.querySelector<HTMLElement>(".sub");
  if (sub) {
    const msg = err instanceof Error ? err.message : String(err);
    sub.textContent = msg.replace(/^storyboard: /, "");
    sub.style.color = "#b0472c";
  }
}

/* A card that fell back to a default still presents, but the author
   should not have to be watching the console to find out. Wherever the
   deck can be edited it is said on the page; a deck being shown keeps
   it to the console, because by then there is an audience.

   Shown once the pictures have been fetched, not as soon as the deck is
   read: a picture that never arrives is the complaint an author is most
   likely to have, and it is only known then. */
function showComplaints(source: DeckSource) {
  if (!import.meta.env.DEV && !source.editable) return;
  const notes = deckComplaints();
  if (!notes.length) return;
  const box = document.createElement("div");
  box.id = "complaints";
  box.textContent = `${notes.length} problem${notes.length > 1 ? "s" : ""} in this deck — see the console`;
  box.title = notes.join("\n");
  document.body.append(box);
}

/* On a host, the one thing added over a published wall: the way back
   into it, for whoever owns it. Everyone else sees the wall alone. */
function offerEdit(source: DeckSource) {
  const to = source.hosted?.editUrl;
  if (!to || source.editable) return;
  const a = document.createElement("a");
  a.id = "edit-pill";
  a.href = to;
  a.textContent = "Edit";
  a.title = "Open the editor on this deck";
  el("app-root")?.append(a);
}

/* The reveal — press A and the wall turns out to have been "generated"
   in a chat — is the project's own joke, for the project's own demo. A
   deck someone publishes to their audience is not the place for it, so
   on a host the markup goes before anyone can find the key. */
function noReveal() {
  for (const n of document.querySelectorAll(".hint-reveal, #reveal, #reveal-shimmer")) n.remove();
}

function boot(source: DeckSource) {
  if (source.mode === "hosted") noReveal();
  let deck: ReturnType<typeof normalizeDeck>;
  try {
    deck = normalizeDeck(source.deck);
    setDeck(deck);
  } catch (err) {
    fail(err);
    throw err;
  }

  document.title = deck.title;
  /* The room, before anything is drawn in it: the chrome around the wall
     takes its colours, then the wall, the floor and the lights. */
  applyChrome(deck.room);
  buildRoom(deck.room);
  lightRoom(deck.room);

  /* The wall needs fonts and pictures before it can be built; the words
     do not. Publishing them first means the deck is readable — and
     crawlable — even if WebGL never comes up at all. */
  buildTranscript(deck.title, STORY, promises);

  const loader = el("loader");
  const mark = loader?.querySelector(".mark");
  /* As text, never as markup: on a host the title is whatever the
     deck's owner typed, and the page is shared with everyone else's. */
  if (mark) {
    const dot = document.createElement("i");
    dot.innerHTML = "&nbsp;•";
    mark.replaceChildren(deck.title, dot);
  }
  const sub = loader?.querySelector(".sub");
  if (sub && deck.subtitle) sub.textContent = deck.subtitle;

  /* The handwriting has to be measurable before a note can be laid out,
     so the wall waits — but not forever, and not on a slow connection. */
  const fontWait = Promise.race([
    Promise.all([
      document.fonts.load("600 40px Caveat"),
      document.fonts.load("600 40px 'Cormorant Garamond'"),
      document.fonts.ready,
    ]),
    new Promise((r) => setTimeout(r, 2600)),
  ]);

  Promise.all([fontWait, loadImages(deck.images)]).then(() => {
    showComplaints(source);
    sizeCards(promises);
    placeCards(promises, STORY);
    promises.forEach(buildCard);
    /* Every picture has been measured and drawn into a texture by now.
       Both references have to go — the cache holds one and each card
       holds the other — or the decoded bitmaps stay resident for the life
       of the page behind a wall that is done with them. */
    for (const p of promises) delete p.userImage;
    releaseImages();
    resolveStory();
    spaceOutCards();
    initControls();
    if (source.mode !== "hosted") initReveal();
    initPresent();
    initDebug();
    offerEdit(source);
    /* The editor is a tool for whoever may edit this deck: beside
       `pnpm dev`, anyone; on a host, its owner on the draft page. It
       arrives as its own chunk, so a deck being shown never loads it. */
    if (source.editable) import("./ui/editor.js").then((m) => m.initEditor());
    requestAnimationFrame(loop);
    setTimeout(() => {
      loader?.classList.add("done");
      fitCamera(); // the window has its real size by now, whatever it said at load
      storyStart();
    }, 400);
  });
}

loadSource().then(boot, fail);
