# Contributing

Thanks for looking. This is a small project and the bar for a change is
simply: does the wall still read well, and is the next person going to
understand why the code is the way it is.

## Getting set up

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. Add `?debug` and `window.__d` gives you the
scene, the camera and the resolved stops, so you can measure the wall
from the console rather than guessing at it.

Press `e` and an editor opens beside the wall, on whichever slide you
are standing at.

- **+ Add** asks what is being added (note, photo, heading) and where
  (this slide, or a new slide after it). On either wide shot it adds a
  slide at that end of the deck, so `slides: []` is a wall you can
  start from.
- A card's fields are grouped by where they show — on the wall, in the
  text version, the narration, its look, its placement — and the first
  group differs by kind. A field is never offered under a name that
  promises something the wall will not draw.
- Typing redraws the card as you go — no reload.
- Drag a card with the pointer and its `x` and `y` write themselves.
- Edits are written a moment after they stop, without a reload: the
  plugin marks a write as its own and answers Vite's `hotUpdate` for
  that file with nothing to update, since the wall already shows it.
  Only a change to the deck's shape — a card or slide added or taken
  away — is written and read back. `⌘S` writes right now.
- A dropped picture goes to `POST /__deck/asset` and lands under
  `public/slides/`, named after itself but tamed, never over a file
  that is already there.
- Removing a card or a slide keeps what was removed in the tab for a
  while and offers it back; undo is a plain write of that block.
- On a wide shot the panel lists the slides; dragging one posts to
  `/__deck/move`, which lifts that slide's text out and lays it in at
  the new place. Comments between slides stay where they were.

The panel is its own chunk, loaded only where the deck may be edited:
beside `pnpm dev`, and on a hosted wall by the deck's owner. A deck
being shown never loads it.

The panel edits cards as data and hands one slide at a time to a
*store* (`src/ui/store.ts`). There are two. The file store prints the
slide as source (`src/deck/print.ts`) and posts it to the plugin in
`tools/deck-editor.js`; `deck-source.js` finds the span of one slide in
the file and swaps the characters, so everything around it — comments,
blank lines, the order somebody chose — is left alone. The one thing it
cannot keep is a comment written *inside* the slide being saved. Writes
are taken one at a time, so a quiet save landing beside a "+ Add"
cannot write over it. The API store sends the slide as JSON to the
server under `server/`, with the revision it saw; a stale revision is a
409, and the panel reloads.

## The hosted wall

`server/` is plain JavaScript with JSDoc types, checked by
`tsconfig.server.json`, and runs on Node 22.13 or later with nothing
compiled: SQLite comes from `node:sqlite`, and the few TypeScript
leaves it shares with the wall (`fields.ts`, `papers.ts`, `rooms.ts`)
are imported by their real names. It runs three ways with the same
routes — beside `pnpm dev` at `/home` (`server/vite.js`), on its own
in front of `dist/` (`pnpm serve`), and in the tests with a database
in memory.

Two rules it holds to. **The server evaluates nothing**: a slide is
checked by `validate.js`, field by field against the same lists the
wall reads, never run. **Every write to a draft goes through
`applyOp`** in `decks.js` — read, change, check, write, in one
transaction, only if the revision still matches — so nothing that
will not check reaches a row, and two windows cannot write over each
other.

`pnpm test` runs the source-editing checks and then the server's
tests (`server/*.test.mjs`, with `node --test`): the operations on a
document, the validator against every example deck, and the whole
server end to end.

## Where things live

[The README](README.md#how-it-is-put-together) has the full tree. The
short version:

- **`src/deck/`** — what an author wrote, turned into what the wall can
  build. Start here for anything about the config format or layout.
- **`src/scene/`** — the room, the cards in it, and the frame loop.
- **`src/textures/`** — everything drawn onto a canvas: paper, murals,
  photographs, plaster, floorboards.
- **`src/config.js`** — every tunable. If you are about to hard-code a
  number that someone might want to change, it belongs here instead.

## Two rules the code holds to

**Wall units, never pixels.** Every position and size is in the wall's
own units, so a composition survives any viewport. Nothing in `src/`
should reach for `innerWidth` except the renderer and the camera.

**The deck is data.** A deck is a plain object. The engine may derive
anything an author left unsaid, but it must never require them to say
it — and anything it derives has to stay overridable. If your change
makes a field mandatory, it is probably the wrong shape.

## Before you open a pull request

`pnpm test` covers the source editing behind the editor; the wall itself
is verified by hand. Please check:

- [ ] `pnpm build` passes — it typechecks the wall and the server first
- [ ] `pnpm test` is green
- [ ] The console is clean on a fresh load
- [ ] The example decks still present: `examples/onboarding`,
      `examples/hello-wall` and `examples/lighthouse-bakery` — point
      `deck.config.js` at each in turn
- [ ] The walk still works end to end: `→` through every stop, `Home`,
      `End`, a click on the plaster, and a click on a card
- [ ] `P` opens the presenter window, it follows the wall, and the
      arrows in it drive the wall back
- [ ] `B`, `T` and `S` do what they say
- [ ] A narrow window still frames every stop
- [ ] If you touched the server: on `pnpm dev`, `/home` still signs in,
      makes a deck from an example, edits it on the wall, and publishes
      it to `/d/…`

The wall lays out the same way on every load — the tilt of each card
comes from a seeded generator, not `Math.random`. Tilts are identical
run to run; positions settle within about 0.03 wall units, since the
separation pass runs against paper whose grain is still free-running.
So a screenshot that moves by more than a hair means something really
changed. That is deliberate; please keep it that way.

## Style

Match the file you are editing. The comments explain *why* rather than
*what*, and are written for someone reading the code a year from now —
please write yours the same way.

## Reporting something

Open an issue. If it is visual, a screenshot is worth more than a
description, and the deck you were presenting is worth more than both.
