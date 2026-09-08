/* The deck, as text.

   The wall is a canvas, and a canvas is pixels. Everything an author
   writes — every heading, every bullet, every figure — is painted into
   it and then, as far as the rest of the web is concerned, gone. It
   cannot be selected or copied, found with the browser's own search,
   translated, read aloud, or indexed by anything that crawls the page.
   For a project whose entire purpose is showing words to people, that
   is the wrong trade to leave standing.

   So the same deck is published twice: once as a wall, and once as an
   ordinary article. Both are built from the same normalized promises,
   so neither can drift from the other. The article is positioned off
   the page rather than hidden — `display: none` and `visibility:
   hidden` are skipped by screen readers, which would defeat the point —
   and it is marked up as one <section> per stop, in the order the deck
   is walked.

   It is also what a search engine sees, and what is left if WebGL is
   unavailable. */

import type { Beat, Promise_ } from "../deck/types.js";
import { resolveImage } from "../deck/images.js";

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  return n;
};

/** One card, as a piece of an article. */
function cardToDom(p: Promise_): HTMLElement {
  // a mural is a heading painted on the wall; it reads as a heading here
  const box = el("div");

  if (p.title) box.append(el(p.type === "mural" ? "h2" : "h3", p.title));
  if (p.text) box.append(el("p", p.text));

  if (p.bullets?.length) {
    const ul = el("ul");
    for (const b of p.bullets) ul.append(el("li", b));
    box.append(ul);
  }

  if (p.table) {
    const table = el("table");
    if (p.table.head) {
      const tr = el("tr");
      for (const c of p.table.head) tr.append(el("th", c));
      const head = el("thead");
      head.append(tr);
      table.append(head);
    }
    const body = el("tbody");
    for (const row of p.table.rows) {
      const tr = el("tr");
      for (const c of row) tr.append(el("td", c));
      body.append(tr);
    }
    table.append(body);
    box.append(table);
  }

  /* A picture is named, not embedded.

     An <img> here would be a second full-resolution decode of something
     already on the wall — seventeen of them came to 217 MB, and being
     clipped to a pixel does not help: the element still has its natural
     layout size, so lazy loading sees it as on-screen and fetches it
     anyway. The words on the card are what a reader needs, and they are
     already above; the link is for whatever wants the file itself. */
  if (p.image) {
    if (p.caption) box.append(el("p", p.caption));
    const a = el("a", p.title ?? p.caption ?? p.text ?? p.image);
    a.href = resolveImage(p.image);
    const line = el("p");
    line.append("Picture: ", a);
    box.append(line);
  }

  /* The narration. A deck being read has nobody standing beside it,
     so what would have been said out loud is the closest thing to a
     speaker it gets. */
  if (p.say) {
    const said = el("p", p.say);
    said.className = "say";
    box.append(said);
  }

  if (p.foot) {
    const small = el("p", p.foot);
    small.className = "foot";
    box.append(small);
  }
  return box;
}

/**
 * Publish the deck as an article beside the wall.
 *
 * @param title the deck's name
 * @param story the stops, in the order they are walked
 * @param promises every card, already normalized
 */
export function buildTranscript(
  title: string,
  story: Beat[],
  promises: Promise_[],
) {
  const root = el("main");
  root.id = "transcript";

  /* A deck that opens on a painted heading of its own name would
     otherwise be announced twice over — "Storyboard, heading level
     one. Storyboard, heading level two." */
  const opener = promises.find((p) => p.slide === 1 && p.title);
  if (opener?.title?.trim().toLowerCase() !== title.trim().toLowerCase())
    root.append(el("h1", title));

  let n = 0;
  for (const beat of story) {
    if (beat.overview) continue; // a wide shot carries no words of its own
    const cards = promises.filter((p) => p.slide === beat.slide);
    if (!cards.length) continue;

    n++;
    const section = el("section");
    section.id = `slide-${beat.slide}`;
    section.setAttribute("aria-label", `Slide ${n}`);
    for (const p of cards) section.append(cardToDom(p));
    root.append(section);
  }

  document.body.append(root);
  return root;
}
