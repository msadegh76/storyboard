/* Getting started — the tour of Promise Wall, given on a wall.

   Every feature the wall has, one stop each, with a picture of the
   real thing beside the words: the keys, the presenter window, the
   text version, the editor and each of its groups. The pictures under
   public/demo/onboarding/ are captures of the app itself, showing the
   `lighthouse-bakery` example.

   This is the deck the project opens on. Point deck.config.js at your
   own when you have one. */

import { defineDeck } from "../../src/deck/types.js";

export default defineDeck({
  title: "Getting started",
  subtitle: "a tour of the wall, on the wall…",
  seed: "tour",

  slides: [
    /* ---------------------------------------------------------------
       Welcome
    --------------------------------------------------------------- */
    {
      mural: "Getting started",
      sub: "Promise Wall, explained on a wall",
      paint: "#3b3527",
      say: "This deck is the tour. Walk it with the arrow keys; every stop shows one thing the wall can do, with a picture of it.",
    },

    {
      notes: [
        {
          image: "demo/onboarding/wall-overview.webp",
          caption: "The wide shot: a whole deck, on one wall",
          title: "The wall",
          text: "Every slide of a deck, pinned to plaster and painted on it, seen all at once.",
        },
        {
          title: "What you are looking at",
          text: "A slide deck presented as a gallery wall in 3D. Cards are pinned to plaster, headings are painted straight onto it, and you walk it with the arrow keys.",
          bullets: [
            "Index cards for words, matted prints for pictures",
            "Headings painted between them, chapter by chapter",
            "One key light, dust in the air, a live 3D room — nothing is a screenshot",
          ],
          paper: "notebook",
          attach: "clip",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/run-it.webp",
          caption: "Two commands",
        },
        {
          title: "Run it",
          text: "Install once, then start the dev server and open the address it prints.",
          bullets: [
            "pnpm install",
            "pnpm dev  →  http://localhost:5173",
            "pnpm build writes dist/, a plain folder of static files",
            "pnpm test checks the source editing behind the editor",
          ],
          foot: "Node and pnpm are all it needs.",
          paper: "graph",
          font: "sans",
        },
      ],
    },

    /* ---------------------------------------------------------------
       Walking the wall
    --------------------------------------------------------------- */
    {
      mural: "Walking the wall",
      sub: "the keys, and the mouse",
      paint: "#4a1c1a",
    },

    {
      notes: [
        {
          image: "demo/onboarding/walk-stop.webp",
          caption: "One stop, framed — the hint sits at the bottom",
        },
        {
          title: "Walk",
          text: "A deck is a walk along the wall. Each slide is a stop, and the camera frames whatever that stop holds.",
          bullets: [
            "→ or ←  one stop forward or back (↑ ↓, PageUp, PageDown, Space and Enter work too)",
            "Click a card to go to its stop — in the wide shot the whole deck is in front of you",
            "Click bare plaster to step forward",
            "Home  out to the opening wide shot · End  to the closing one",
            "Esc  backs out of whatever is over the wall",
          ],
          say: "Say the arrow keys out loud once. That is the whole interface.",
          paper: "classic",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/stop-link.webp",
          caption: "S copies the link to the stop you are on",
        },
        {
          title: "Every stop has an address",
          text: "The stop you are standing on is in the address bar as #slide-5, and the counter in the corner says where you are in the walk.",
          bullets: [
            "Paste a link and the deck opens on that stop",
            "S copies the link to the stop you are on",
            "The routing is in the fragment, so links work on any static host",
          ],
          paper: "pastelGreen",
          doodle: "arrow",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/text-version.webp",
          caption: "T: the deck, as text",
        },
        {
          title: "Read it as text",
          text: "The same deck is published twice: once as the wall, once as an ordinary article. T opens it.",
          bullets: [
            "Every heading, bullet, table and picture, in walking order",
            "The narration too — what a speaker would have said",
            "What search engines and screen readers get, and what is left if WebGL never comes up",
          ],
          paper: "kraft",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/blackout.webp",
          caption: "B: the room looks at you",
        },
        {
          title: "Blackout",
          text: "B drops a sheet over the wall for the moments when the audience should be looking at the speaker, not the slides. B again brings it back.",
          paper: "pastelPurple",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/presenter.webp",
          caption: "P: the presenter window",
        },
        {
          title: "Present it",
          text: "P opens a second window: what you meant to say on this stop, the next stop, and a clock. Put the wall on the projector and this on your laptop.",
          bullets: [
            "It is a second window, not a second app — no server, nothing to set up",
            "The arrow keys work in either window and drive both",
            "What it shows comes from say: on a card",
          ],
          say: "This is the window you will actually look at while talking.",
          paper: "notebook",
          attach: "tape",
        },
      ],
    },

    /* ---------------------------------------------------------------
       Writing a deck
    --------------------------------------------------------------- */
    {
      mural: "Writing a deck",
      sub: "a file, or the wall itself",
      paint: "#2f5d8a",
    },

    {
      notes: [
        {
          image: "demo/onboarding/deck-file.webp",
          caption: "deck.config.js — the whole API",
        },
        {
          title: "The deck is a file",
          text: "A deck is a list of slides. A slide is one card, or several held together in notes: [ ]. That is all there is to write.",
          bullets: [
            "No positions, no widths, no rotations — the wall lays it out",
            "A card with words is a note; with image: a photo; with mural: a heading",
            "Every example under examples/ is a working deck you can copy",
            "defineDeck() is only there so your editor can check the file as you type",
          ],
          paper: "graph",
          font: "sans",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/stop-heading.webp",
          caption: "A heading, painted into the plaster",
        },
        {
          image: "demo/onboarding/stop-photo-note.webp",
          caption: "A photo and a note, held in one slide",
        },
        {
          title: "Three kinds of card",
          bullets: [
            "Note — words on paper. It curls, sways and casts a shadow",
            "Photo — a picture matted like a print, sized from its own shape, with a caption on the mat if you give it one",
            "Heading — writing painted on the wall (mural: in the file). It never lifts, and the paper flows around it",
          ],
          foot: "A photo whose file never arrives falls back to a note, so a deck presents before its pictures have landed.",
          paper: "classic",
        },
      ],
    },

    /* ---------------------------------------------------------------
       The editor
    --------------------------------------------------------------- */
    {
      mural: "The editor",
      sub: "press E",
      paint: "#6d5334",
      say: "Everything from here on is the editor. It only exists while pnpm dev is running; a built deck never carries it.",
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-open.webp",
          caption: "E opens the panel beside the wall",
        },
        {
          title: "Edit on the wall",
          text: "Press E and a panel opens beside the wall, on whichever slide you are standing at. The camera moves over to frame the slide in the space that is left.",
          bullets: [
            "Click a card on the wall to edit that one",
            "Typing redraws the card as you go — no reload",
            "Everything it does lands in your deck file, in the shape you would have written",
          ],
          paper: "notebook",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-add.webp",
          caption: "+ Add: what, and where",
        },
        {
          title: "+ Add",
          text: "The first question is what you are adding. The second is where.",
          bullets: [
            "Note, Photo or Heading — each with a picture of itself and a line on what it does",
            "This slide, or a new slide after it",
            "On the opening wide shot it adds at the front of the deck, on the closing one at the end",
            "An empty deck — slides: [ ] — is a wall you press E on",
          ],
          paper: "pastelPink",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-add-photo.webp",
          caption: "A photo takes a file",
        },
        {
          title: "Pictures",
          text: "Choose Photo and it asks for the file. Drop one there, on the wall, or on a photo card that already exists.",
          bullets: [
            "Copied into public/slides/ and named for you",
            "PNG, JPEG, GIF or WebP",
            "Typing a path under public/ still works",
          ],
          paper: "kraft",
          doodle: "star",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-fields-all.webp",
          caption: "A card, every group open",
        },
        {
          title: "Fields, grouped by where they show",
          text: "A field is only ever offered under the name of the place it shows, so nothing promises something the wall will not draw.",
          bullets: [
            "On the wall — what the card draws; different for each kind",
            "In the text version — a photo's words, published beside the wall",
            "Narration — what you say",
            "Look — paper, pin, doodle, lettering; paint for a heading",
            "Placement — width, tilt, and where it hangs",
            "Change kind… — turn it into another kind of card",
          ],
          paper: "classic",
          font: "sans",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-photo-words.webp",
          caption: "A photo's words go to the text version",
        },
        {
          title: "What a photo shows",
          text: "On the wall a photo shows its picture, and a caption if it has one. Nothing else is drawn on it.",
          bullets: [
            "Title, text, bullets and a table still belong to it — they are published under In the text version",
            "If the file never arrives, those words stand in for the picture",
            "Replace the picture from the same group, by file or by path",
          ],
          paper: "pastelGreen",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-narration.webp",
          caption: "Narration: what you say",
        },
        {
          title: "Narration",
          text: "What you say while this card is up. It is never drawn on the wall.",
          bullets: [
            "Press P and it opens in the presenter window, beside the next slide and a clock",
            "It is published in the text version too — write what an audience would hear",
          ],
          say: "Like this line. You are reading the narration of the stop about narration.",
          paper: "notebook",
          attach: "clip",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-look-placement.webp",
          caption: "Look, and Placement",
        },
        {
          title: "Look and Placement",
          text: "Look is the paper it is on, what pins it up, a doodle in the corner and the hand it is written in. Placement is the numbers the wall worked out, if you want them.",
          bullets: [
            "Width and tilt; across and up, in wall units — never pixels",
            "Anything you set is kept; anything you leave alone, the wall decides",
            "Let the wall place it forgets a pinned position",
            "Space out pushes apart anything that overlaps",
          ],
          paper: "graph",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-drag.webp",
          caption: "Dragging a card into place",
        },
        {
          title: "Move it with the pointer",
          text: "Positions are miserable to guess at and obvious to point at. Drag a card and the wall keeps it where you let go.",
          bullets: [
            "Across and Up follow the card as it moves",
            "A click is a click; only a real drag pins the card",
            "Written a moment after you let go",
          ],
          paper: "torn",
          doodle: "arrow",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-change-kind.webp",
          caption: "Change kind…",
        },
        {
          title: "Change kind",
          text: "A card can become another kind in place. It is a conversion, so it sits behind a fold, with a line on what changes.",
          bullets: [
            "A photo shows only its picture, a heading only its heading and a line",
            "Words that no longer fit stay in the file and in the text version",
          ],
          paper: "pastelPurple",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-slides.webp",
          caption: "Slides: the whole deck, in order",
        },
        {
          title: "Reorder",
          text: "Slides lists every slide, each wearing the kinds of its cards, with the one you are on marked.",
          bullets: [
            "Click a slide to go to it",
            "Drag one — or use the arrows beside it — to put it somewhere else",
            "The same list is on either wide shot",
          ],
          paper: "classic",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-undo.webp",
          caption: "Undo, for a while",
        },
        {
          title: "Remove, and take it back",
          text: "Remove this card and Delete this slide ask nothing first. A bar appears with Undo on it and stays for a few seconds.",
          bullets: [
            "Undo puts the card or the slide back exactly where it was",
            "For everything else, the file is the deck — and git is the undo",
          ],
          paper: "kraft",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/onboarding/editor-panel.webp",
          caption: "Saved · Unsaved · Saving…",
        },
        {
          title: "Saved as you go",
          text: "Everything is written a moment after you stop. The header says whether the wall and the file agree.",
          bullets: [
            "⌘S writes right now",
            "Only the one slide is touched, and only the values you chose — defaults stay unwritten",
            "Comments, blank lines and the rest of the file are left exactly as they were",
            "Adding, removing or moving a slide rebuilds the page from the file, and lands you back where you were",
          ],
          paper: "notebook",
          font: "sans",
        },
      ],
    },

    /* ---------------------------------------------------------------
       Publishing
    --------------------------------------------------------------- */
    {
      mural: "Publishing",
      sub: "a folder of files",
      paint: "#4a1c1a",
    },

    {
      notes: [
        {
          image: "demo/onboarding/publish.webp",
          caption: "pnpm build → dist/",
        },
        {
          title: "Publish it",
          text: "dist/ is a plain folder of static files. There is no server to run and nothing to configure.",
          bullets: [
            "Every path is relative — it works at a domain root, a project page, or a folder on a drive",
            "A stop is #slide-4, so deep links need no rewrite rules",
            "Drag dist/ onto Netlify Drop, or push it to a gh-pages branch",
            "The editor is not in it: a built deck is only the wall",
          ],
          paper: "graph",
        },
      ],
    },

    {
      mural: "Now write your own",
      sub: "examples/hello-wall is the short tour · this deck is examples/onboarding",
      paint: "#3b3527",
      rule: false,
      say: "Point deck.config.js at a file of your own, or press E and start on this one.",
    },
  ],
});
