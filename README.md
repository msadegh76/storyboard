# Promise Wall

A slide deck presented as a gallery wall in 3D. Index cards pinned to
plaster, headings painted straight onto the wall, lit by a single key
light with dust in the air — walked with the arrow keys.

Built with [three.js](https://threejs.org) and [GSAP](https://gsap.com).
No framework.

<!-- Drop the capture in and this shows the wall in motion, which is the
     only way to convey it. See docs/README.md for what to record. -->
![The wall, walked end to end](docs/wall.gif)

## Run it

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173.

```bash
pnpm build     # → dist/ — typechecks first
pnpm preview   # serve the build
pnpm test      # the source editing behind the editor, against both example decks
```

## Present it

| key | what it does |
| --- | --- |
| `←` `→` | walk the wall, one stop at a time |
| click a card | go to that card's stop — in the wide shot the whole deck is in front of you, so "show me that chart again" is something you point at |
| click the plaster | the same as `→` |
| `Home` | out to the wide shot &middot; `End` for the last stop |
| `P` | the presenter window: what you meant to say, the next stop, and a clock |
| `B` | blackout, for when the room should look at you |
| `T` | read the deck as text |
| `S` | copy a link to the stop you are standing on |
| `Esc` | back out of whatever is over the wall |
| `E` | with `pnpm dev` only: edit the slide you are standing on — see [Or write it on the wall](#or-write-it-on-the-wall) |

The presenter window is a second window, not a second app — it takes
its deck over a `BroadcastChannel`, so there is no server and nothing
to set up. Put the wall on the projector and this on your laptop. The
arrow keys work in either one.

What you say comes from `say:` on a card:

```js
{
  title: "The idea",
  text: "One sentence that carries the slide.",
  say: "Open on why this mattered, then land on the number.",
}
```

It is **published**, not private — a deck being read rather than
watched has nobody standing beside it, so `say:` is the narration that
stands in for one, and it appears in the text version (`T`). Write what
an audience would hear.

## Publish it

`dist/` is a plain folder of static files. There is no server to run
and nothing to configure, because two things were decided early:

- **The routing is in the fragment.** A stop is `#slide-4`, which the
  browser never asks a server about — so deep links work on a host that
  knows nothing about the deck. No rewrite rules, no SPA fallback.
- **Every path is relative.** The build writes `./assets/…`, and a
  card's `image:` is relative too, so the same folder works at a
  domain root, at `username.github.io/my-deck/`, or three directories
  deep inside something else.

The shortest way to put one up, with no account and no command:
build, then drag the `dist/` folder onto [Netlify
Drop](https://app.netlify.com/drop). For GitHub Pages, push `dist/` to
a `gh-pages` branch and point Pages at it.

## Write a deck

Open [`deck.config.js`](deck.config.js). A deck is a list of slides, and
a slide is one stop on the walk:

```js
import { defineDeck } from "./src/deck/types.js";

export default defineDeck({
  title: "My Wall",
  slides: [
    { mural: "Chapter One", sub: "where it starts" },

    {
      title: "The idea",
      text: "One sentence that carries the slide.",
      bullets: ["a point", "another point"],
      paper: "kraft",
    },

    { notes: [
      { title: "Left", text: "Two cards, one stop." },
      { image: "shots/dashboard.png", title: "Right" },
    ]},
  ],
});
```

That is the whole API. **No positions, no widths, no rotations** — the
engine reads the slides onto the board left to right and down a row,
sizes each picture from its own shape, and opens the gaps between
cards. Run `pnpm dev` and it is on the wall.

`slides: []` is allowed too: a bare wall, which is where a new deck
starts — see the next section.

### Or write it on the wall

With `pnpm dev` running, press `E` and an editor opens beside the wall,
on whichever slide you are standing at. It is the quickest way to write
a deck, because a wall is a composition and a composition has to be
looked at. Everything it does lands in your deck file — the same file,
the same shape, nothing else to keep in sync.

- **+ Add** asks what you are adding — a note, a photo, or a heading
  painted on the wall — and where: this slide, or a new slide after
  it. On the opening wide shot it adds a slide at the front, on the
  closing one at the end, so an empty deck is a wall you press `E` on.
- Click a card on the wall to edit it. Its fields are grouped by where
  they show: **On the wall** first (a photo has only its picture and a
  caption there; its other words go under **In the text version**),
  then **Narration** — what you say, shown in the presenter window —
  then **Look** and **Placement**. **Change kind…** turns a card into
  another kind in place.
- Typing redraws the card as you go — no reload. Drag a card with the
  pointer and it stays where you left it.
- A photo takes its picture as a file: drop one on the wall, or on the
  panel, or choose it — it is copied into `public/slides/` and the
  card points at it. Typing a path still works.
- Everything is saved as you go, a moment after you stop. The header
  says **Saved**, **Unsaved** or **Saving…**; `⌘S` writes right now.
  Only the one slide is touched, and only the values you actually
  chose are written — a default stays unwritten, and so does a position
  the layout worked out for itself. Comments, blank lines and the rest
  of the file are left exactly as they were.
- Removing a card or deleting a slide can be undone from the bar that
  appears, for a few seconds.
- **Slides** — or either wide shot — lists every slide. Click one to
  go there; drag it, or use the arrows beside it, to change the order.

It is a dev tool: none of it reaches a built deck. The panel calls a
mural a *heading*, because that is what it is for; the field in the
file is still `mural:`.

Pictures live under [`public/`](public), and an `image:` path is
relative to it — `image: "shots/dashboard.png"` loads
`public/shots/dashboard.png`.

Every deck under [`examples/`](examples) is a working one you can copy.
[`onboarding`](examples/onboarding/deck.config.js) is the tour of the
wall, given on the wall — every feature, one stop each, with a picture
of the real thing — and it is the deck the project opens on.
[`hello-wall`](examples/hello-wall/deck.config.js) is a shorter tour of
every kind of card; [`lighthouse-bakery`](examples/lighthouse-bakery/deck.config.js)
is a full-length deck, fifteen stops long, about a bakery that does not
exist — its captures are drawings of screens nobody runs, under
[`public/demo/`](public/demo).

`defineDeck` is identity at runtime — it exists so an editor can
complete and check the deck as you write it. Your deck stays plain
JavaScript; you get the autocomplete anyway. Write `deck.config.ts`
instead if you would rather, and it works the same — the editor
included. (Rename it while `pnpm dev` is running and restart the
server; Vite keeps the old path until you do.)

### The three kinds of card

|  | Written as | Behaves like |
| --- | --- | --- |
| **note** | anything with words | paper, pinned to the wall. It curls, sways, and casts a shadow |
| **photo** | anything with an `image:` | a capture, matted like a print. Sized from the picture's own proportions; a `caption:` is written on the mat under it. Its other words go to the text version only |
| **mural** | anything with a `mural:` | writing painted into the plaster. Never lifts, sways, or casts a shadow, and the layout moves paper around it rather than moving it |

A photo whose file never arrives falls back to a plain note, so a deck
presents before its screenshots have landed.

### Every field

**On a slide**

| Field | Meaning |
| --- | --- |
| `notes: [...]` | several cards held in one stop; the camera frames them together |
| anything else | the slide *is* one card — write its fields directly |

**On a card**

| Field | Meaning |
| --- | --- |
| `title` | the heading |
| `text` | a sentence under it |
| `bullets: []` | a list; a card with one reads ranged left |
| `table: { head, rows }` | a figure read by column; it shrinks to clear the margins |
| `foot` | a faint line at the bottom |
| `image` | a path under `public/` — makes it a photo |
| `caption` | a line written under a photo's picture, on the mat |
| `mural` | the heading, painted on the wall — makes it a mural |
| `sub` | the smaller line under a `mural:` heading |
| `paper` | `classic` `notebook` `graph` `pastelPink` `pastelPurple` `pastelGreen` `kraft` `torn` |
| `attach` | `pin` `clip` `tape` |
| `font` | `hand` (default) `serif` `sans` |
| `doodle` | `heart` `star` `sprig` `arrow` |
| `paint` | a mural's colour, as `#rrggbb` |
| `pinColor` | the pin's metal, as a hex number |

**On the deck**

| Field | Meaning |
| --- | --- |
| `title` | the browser tab and the loader |
| `subtitle` | the line under it while the wall builds |
| `seed` | anything; changes how the cards are tilted |
| `overview` | `"both"` (default), `"start"`, `"end"`, or `"none"` — the wide shots that open and close the walk |

### When you want it by hand

Any card may pin what the engine would otherwise decide. Values are in
**wall units**, never pixels, so a composition survives any viewport.

| Field | Overrides |
| --- | --- |
| `x`, `y` | where it hangs. Set both and the flow parts around it |
| `w` | how wide it is |
| `ratio` | height ÷ width. Otherwise measured from the words, or the picture |
| `rot` | the tilt, in degrees |

Hand-placed cards and flowed ones mix freely, and the spacing pass runs
over both — so you can pin cards roughly where you want them and let the
engine open the gaps.

### The knobs

[`src/config.ts`](src/config.ts) holds every tunable the wall has: the
size of the room, how wide a row may run, the gap between cards, how
much of the frame a focused card fills.

## Walking the wall

| Key | Does |
| --- | --- |
| `→` `↓` `PageDown` `Space` `Enter` | next stop |
| `←` `↑` `PageUp` | previous stop |
| `Home` `Esc` | back to the opening overview |
| `End` | jump to the closing overview |
| `A` | an easter egg |

A click anywhere on the wall also steps forward.

Add `?debug` to the URL to expose `window.__d` — the scene, the camera
and the resolved stops — for measuring the wall from the console.

## How it is put together

```
index.html            the shell: markup, fonts, and one module script
present.html          the presenter window — its own page, no three.js
deck.config.js        which deck to present
vite.config.js        relative paths for the build; the editor's plugin in dev
examples/             decks you can copy
public/               images the decks point at — `image:` paths resolve here
tools/
  deck-editor.js      the dev server's half of the editor: writes slides, saves pictures
  deck-source.js      edits a deck file as text, one slide's span at a time
  deck-source.test.mjs

src/
  main.ts             boot — read the deck, fetch, build, open it
  config.ts           every tunable
  util.ts             rnd, clamp, shade, a seeded generator
  vendor.ts           the one place three.js and GSAP are reached through
  debug.ts            window.__d, behind ?debug
  present.ts          the presenter window's script
  present-protocol.ts what the wall and the presenter say to each other

  deck/
    types.ts          the deck format — every field an author can set
    schema.ts         what an author wrote → what the wall can build
    complaints.ts     what a deck got wrong, collected rather than thrown
    layout.ts         reading the deck onto the board, then opening gaps
    story.ts          resolving stops, and flying between them
    images.ts         fetching the pictures a deck asks for
    state.ts          the deck, once it has been read

  scene/
    stage.ts          renderer, camera, lights — and fitting the camera to the window
    room.ts           plaster, floorboards, skirting, contact shading, dust
    card.ts           one promise → one group on the wall
    pick.ts           which card is under the pointer
    loop.ts           one frame: spring the camera, settle cards, drift dust
    sound.ts          a synthesized tap when the deck moves
    pointer.ts        read only for the camera's parallax drift

  textures/
    papers.ts         the paper stocks
    draw.ts           canvas primitives: speckle, torn edges, text, doodles
    paper.ts          a note: stock, ruling, handwriting, doodle
    mural.ts          writing painted into the plaster
    photo.ts          a capture, matted like a print, with a caption if it has one
    surfaces.ts       tape, plaster, floorboards

  ui/
    controls.ts       the keys and the click that move the deck
    transcript.ts     the deck as text — for readers, search and screen readers
    present.ts        opening the presenter window and keeping it in step
    editor.ts         the wall, edited from inside itself (dev only)
    reveal.ts         the easter egg

  styles/             base, loader, hud, present, editor, reveal
```

The same wall lays out the same way on every load: the tilt of each card
comes from a seeded generator rather than `Math.random`, so a screenshot
is reproducible and a regression is visible. Change `seed` in the deck to
shuffle it.

## Licence

MIT — see [LICENSE](LICENSE).
