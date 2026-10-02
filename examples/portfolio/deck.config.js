/* A portfolio: six pieces of work as prints on a dark wall, and one
   card about you.

   The pictures under public/demo/templates/ are placeholders —
   abstract prints, so the wall reads as a wall before your work is on
   it. Drop your own onto any of them and the caption is yours to keep
   or change. */

import { defineDeck } from "../../src/deck/types.js";

export default defineDeck({
  title: "Selected work",
  subtitle: "six pieces, one wall",
  room: "night",
  seed: "portfolio",

  slides: [
    {
      mural: "Selected work",
      sub: "your name, and what you do, in one line",
      say: "Say your name. Say what you make. Then let them look.",
    },

    {
      image: "demo/templates/work-01.svg",
      caption: "Identity for a bakery — 2026",
      title: "Identity for a bakery",
      text: "A mark, a hand, and the paper it all sits on.",
      say: "Lead with the piece you would want to talk about for ten minutes.",
    },

    {
      image: "demo/templates/work-02.svg",
      caption: "Poster series — three of nine",
      title: "Poster series",
      text: "Nine posters for nine talks, one grid, nine tempers.",
    },

    {
      notes: [
        {
          image: "demo/templates/work-03.svg",
          caption: "App onboarding — before",
          say: "A before and an after on one stop. The wall does the comparison for you.",
        },
        {
          image: "demo/templates/work-04.svg",
          caption: "App onboarding — after",
        },
      ],
    },

    {
      image: "demo/templates/work-05.svg",
      caption: "Editorial spread — a magazine that never printed",
      title: "Editorial spread",
      text: "Commissioned, designed, cancelled. Still the best type I have set.",
    },

    {
      image: "demo/templates/work-06.svg",
      caption: "Packaging — the whole line",
      title: "Packaging",
      text: "Twelve boxes that had to look like one family on a shelf.",
    },

    {
      title: "About",
      text: "Designer, mostly of things people hold. Ten years, three studios, one of my own.",
      bullets: [
        "Identity, packaging, editorial",
        "Available from November",
        "Based wherever the work is",
      ],
      say: "Keep this card short. The work already said the long version.",
      paper: "classic",
      attach: "tape",
    },

    {
      mural: "Get in touch",
      sub: "your email, written on the wall",
      say: "One way to reach you, not four.",
    },
  ],
});
