/* Hello, wall — the deck the project ships with.

   It is a deck about decks: every kind of card the wall can hang is on
   it somewhere, so you can see what a thing looks like before you write
   it. Copy this file, replace the words, and you have your own.

   Notice what is *not* here: no coordinates, no widths, no rotations.
   The engine reads these slides onto the board left to right and down a
   row, sizes each picture from its own shape, and opens the gaps. Every
   one of those is still an override if you want it — see the README. */

import { defineDeck } from "../../src/deck/types.js";

export default defineDeck({
  title: "Promise Wall",
  subtitle: "pinning the deck to the wall…",

  slides: [
    /* A slide with one `mural:` is writing painted into the plaster
       rather than paper pinned to it. Use them as section headings —
       they never lift, sway, or cast a shadow. */
    {
      mural: "Promise Wall",
      sub: "a slide deck you can walk",
      paint: "#3b3527",
      say: "Wait here a moment. Let the room take in that it is a wall, not a slide.",
    },

    /* The plainest slide there is: a title and some words. Anything you
       do not say — the paper, the pin, the tilt — is decided for you.

       `say:` is what you say out loud while this card is up. Press P
       and it opens in a second window with the next card and a clock,
       so you can put the wall on the projector and this on your laptop.
       It is published too: someone reading the deck instead of watching
       it has no speaker, and this stands in for one. */
    {
      title: "What this is",
      text: "A deck presented as a gallery wall. Cards are pinned to plaster, lit by one key light, and walked with the arrow keys.",
      bullets: [
        "Write your slides as an array — that is the whole API",
        "Positions, widths and tilts are worked out for you",
        "Nothing is a screenshot: it is a live 3D room",
      ],
      say: "Open on why a deck is a place rather than a stack — people remember where a thing was on a wall.",
      foot: "Press → to walk on.",
      paper: "notebook",
      attach: "clip",
    },

    /* `notes:` holds several cards in one stop. The camera pulls back
       far enough to frame all of them together, however many there are. */
    {
      notes: [
        {
          title: "Paper",
          text: "Eight stocks, from a torn sheet to graph to kraft.",
          bullets: ["classic", "notebook", "graph", "kraft"],
          paper: "kraft",
        },
        {
          title: "Ink",
          text: "Three hands: a marker, a serif, and a plain sans.",
          bullets: ["hand — the default", "serif", "sans"],
          paper: "pastelGreen",
          doodle: "sprig",
        },
        {
          title: "Fixings",
          text: "How a card is held to the wall.",
          bullets: ["pin", "clip", "tape"],
          paper: "pastelPurple",
          attach: "tape",
        },
      ],
    },

    /* A card with an `image:` becomes a photograph, matted like a print
       and sized from the shape of the picture itself — a wide capture
       stays wide, a phone capture stays narrow. If the file never
       arrives the card falls back to these words, so a deck presents
       before its screenshots have landed. */
    {
      notes: [
        {
          image: "demo/paper-stocks.png",
          title: "The eight stocks",
          text: "A wide capture stays wide.",
        },
        {
          title: "Pictures",
          text: "Point `image:` at anything under `public/`.",
          bullets: [
            "The mount follows the picture's own proportions",
            "A missing file degrades to a plain note",
            "Big captures keep their pixels — no mush",
          ],
          paper: "graph",
        },
      ],
    },

    /* A `table:` is a figure the eye reads by column. It shrinks on
       width as well as height until it clears the margins. */
    {
      title: "Numbers, if you have them",
      table: {
        head: ["Stop", "Cards", "Kind"],
        rows: [
          ["Opening", "—", "overview"],
          ["Headings", "1", "mural"],
          ["Notes", "1–4", "paper"],
          ["Captures", "1–4", "photo"],
        ],
      },
      foot: "A table is just another field on a card.",
      paper: "classic",
    },

    /* Overrides, for when you want the composition by hand. Any card
       may set `x`, `y`, `w`, `ratio` or `rot` in wall units and the
       engine will leave it exactly there. */
    {
      title: "When you want it by hand",
      text: "Set x, y, w, ratio or rot on any card and the layout leaves it alone. Mix hand-placed cards with flowed ones freely.",
      foot: "Wall units, never pixels — so a composition survives any viewport.",
      paper: "torn",
      font: "serif",
      doodle: "arrow",
    },

    {
      mural: "Now go and write your own;",
      sub: "start with examples/hello-wall/deck.config.js",
      paint: "#4a1c1a",
    },
  ],
});
