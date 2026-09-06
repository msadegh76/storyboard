/* Boot: read the deck, fetch what it asks for, build the wall, open it.

   Every module below is imported for its effect on the scene, in the
   order the wall is assembled. The styles are not among them — they are
   linked from index.html so they block the first paint. */

import { el } from "./util.js";
import { fitCamera } from "./scene/stage.js";
import "./scene/room.js";
import "./scene/pointer.js";
import { buildCard } from "./scene/card.js";
import { loop } from "./scene/loop.js";
import { normalizeDeck, sizeCards, deckComplaints } from "./deck/schema.js";
import { setDeck, STORY, promises } from "./deck/state.js";
import { loadImages, releaseImages } from "./deck/images.js";
import { resolveStory, storyStart, storyReframe } from "./deck/story.js";
import { placeCards, spaceOutCards } from "./deck/layout.js";
import { initControls } from "./ui/controls.js";
import { initReveal } from "./ui/reveal.js";
import { initPresent } from "./ui/present.js";
import { buildTranscript } from "./ui/transcript.js";
import { initDebug } from "./debug.js";
import config from "../deck.config.js";

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

let deck: ReturnType<typeof normalizeDeck>;
try {
  deck = normalizeDeck(config);
  setDeck(deck);
} catch (err) {
  fail(err);
  throw err;
}

document.title = deck.title;
/* A card that fell back to a default still presents, but the author
   should not have to be watching the console to find out. On a dev
   server it is said on the page; a built deck keeps it to the console,
   because by then it is being shown to an audience.

   Shown once the pictures have been fetched, not as soon as the deck is
   read: a picture that never arrives is the complaint an author is most
   likely to have, and it is only known then. */
function showComplaints() {
  if (!import.meta.env.DEV) return;
  const notes = deckComplaints();
  if (!notes.length) return;
  const box = document.createElement("div");
  box.id = "complaints";
  box.textContent = `${notes.length} problem${notes.length > 1 ? "s" : ""} in this deck — see the console`;
  box.title = notes.join("\n");
  document.body.append(box);
}

/* The wall needs fonts and pictures before it can be built; the words
   do not. Publishing them first means the deck is readable — and
   crawlable — even if WebGL never comes up at all. */
buildTranscript(deck.title, STORY, promises);

const loader = el("loader");
const mark = loader?.querySelector(".mark");
if (mark) mark.innerHTML = `${deck.title}<i>&nbsp;•</i>`;
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
  showComplaints();
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
  initReveal();
  initPresent();
  initDebug();
  /* The editor is a dev tool, not part of the deck. The branch is
     statically false in a build, so the module — and the stylesheet it
     pulls in — is never emitted at all. */
  if (import.meta.env.DEV)
    import("./ui/editor.js").then((m) => m.initEditor());
  requestAnimationFrame(loop);
  setTimeout(() => {
    loader?.classList.add("done");
    fitCamera(); // the window has its real size by now, whatever it said at load
    storyStart();
  }, 400);
});
