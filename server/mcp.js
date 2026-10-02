/* The wall, for somebody else's AI.

   An assistant the author already pays for — Claude, Cursor, whatever
   speaks the protocol — is pointed at /api/mcp with the same token
   `pnpm push` uses, and from then on it can make a deck, write slides
   into it and put it at a link. Nothing here calls a model. The wall
   holds no key and pays for no thinking; it only answers a protocol.

   Every tool is a route this server already has. A call is dispatched
   back through the app itself, with the caller's own token on it, so
   ownership, the revision check, the validator's complaints and the
   size limits are the ones the panel meets — there is no second way
   in and nothing to keep in step.

   One POST, no session, no stream: a request goes in and its answer
   comes straight back as JSON. That is all the protocol asks of a
   server with nothing to say on its own.

   ponytail: the envelope is hand-rolled, like mail.js's SMTP. If a
   client ever wants a session id or an event stream, swap it for
   @modelcontextprotocol/sdk's StreamableHTTPServerTransport. */

import { TEMPLATES, exampleNames } from "./examples.js";
import { CARD, DECK, LIMITS } from "./validate.js";
import { ATTACHES, DOODLES, FONTS, OVERVIEWS, TYPES } from "../src/deck/fields.ts";
import { PAPERS } from "../src/textures/papers.ts";
import { FLOORS, LIGHTS, ROOMS } from "../src/rooms.ts";

/** @typedef {import("hono").Context} Context */
/** @typedef {import("hono").Hono} Hono */

const NAME = "storyboard";
const VERSION = "0.1.0";
/* The versions of the protocol this answers. A client asking for one
   of them is told the same back; a client asking for anything else is
   told the newest, which is what it is going to get. */
const SPOKEN = ["2025-06-18", "2025-03-26", "2024-11-05"];

/* What a deck is, told once, so an assistant does not have to guess a
   field name and watch the validator drop it. The lists come from the
   same leaves validate.js checks against, so this cannot drift. */
const SCHEMA = `A deck is { title, slides: [ ... ] } and a slide is one card, or several
held together as { cards: [ ... ] }.

A card is a plain string, or an object. Everything is optional except
having *something to draw* — a title, some text, a table, or bullets:

  "Just a sentence."                                  a whole slide
  { title: "Something", text: "Something else" }
  { title: "Three things", bullets: ["one", "two", "three"] }
  { title: "Q3", table: { head: ["a", "b"], rows: [["1", "2"]] } }
  { mural: "A painted heading", sub: "and a line under it" }

What a card may carry:
  ${Object.keys(CARD).join(", ")}

Leave out x, y, w, ratio, rot and slide. Those are position and tilt,
and the wall lays the cards out and tilts them itself. Set them only
when asked to move something to a particular place.

  title    the heading          text     a line or a paragraph
  bullets  a list               foot     a faint line at the foot
  table    { head?, rows }      say      what is said aloud while it is up;
                                         it is published as the narration
  mural    a heading painted on the plaster, no paper behind it
  sub      the smaller line under a mural
  image    only a picture already uploaded to this deck; a web address
           is not one, and cannot be fetched

What a deck may carry, beside its slides:
  ${Object.keys(DECK).join(", ")}

  room ${ROOMS.join(" | ")} — the wall, floor and light chosen whole
  floor ${FLOORS.join(" | ")}      light ${LIGHTS.join(" | ")}
  overview ${OVERVIEWS.join(" | ")} — the wide shots at the ends of the walk
  wall  a #rrggbb tint      subtitle  the line under the title
  seed  anything; it fixes the tilts so the wall lays out the same twice

Values a card chooses from:
  type ${TYPES.join(" | ")}
  font ${FONTS.join(" | ")}      attach ${ATTACHES.join(" | ")}
  doodle ${DOODLES.join(" | ")}
  paper ${Object.keys(PAPERS).join(" | ")}

Slides are numbered from 1. At most ${LIMITS.slides} of them, ${LIMITS.cardsPerSlide} cards on any one.

Pictures cannot be sent through here. Write the words, then tell the
author to drop the pictures on the wall itself at the deck's edit
address, which read_deck gives you.`;

const INSTRUCTIONS = `Storyboard turns slides into a gallery wall in 3D: index cards pinned
to plaster, walked with the arrow keys.

Every deck here belongs to the person whose token you are holding.
Start with list_decks. Write into the draft as often as you like —
nothing is at its public link until publish is called.

Call deck_schema before writing a slide for the first time. Every
write answers with any complaints the validator made: a complaint
means something was dropped, so read it and write the card again.

Wherever a tool asks for a deck, its slug or its id will do.`;

/* ------------------------------------------------------------------
   The tools: each one a route this server already answers
------------------------------------------------------------------ */

const str = (/** @type {string} */ description) => ({ type: "string", description });
const int = (/** @type {string} */ description) => ({ type: "integer", description });

/**
 * What a tool is given to work with: a way to call this server as the
 * caller, and a way to turn "my-talk" into the deck it names.
 * @typedef {object} Hands
 * @property {(method: string, path: string, body?: unknown) => Promise<Record<string, any>>} send
 * @property {(v: unknown) => Promise<Record<string, any>>} deck the deck a slug or an id names
 * @property {import("./config.js").Config} config
 */

/**
 * @typedef {object} Tool
 * @property {string} name
 * @property {string} description
 * @property {Record<string, unknown>} properties
 * @property {string[]} [required]
 * @property {(args: Record<string, any>, hands: Hands) => Promise<unknown>} run
 */

const WHICH = str("Which deck: its slug or its id, as list_decks gives them.");
const SLIDE = {
  description:
    "The card. A plain string for a card of text, or an object with any of title, text, bullets, foot, table, say. Leave out position and tilt — the wall lays it out. See deck_schema.",
  type: ["object", "string"],
};
const REV = int(
  "Only if you were told one by an earlier write, to catch an edit made in another window. Leave it out otherwise.",
);

/** @type {Tool[]} */
const TOOLS = [
  {
    name: "list_decks",
    description: "Every deck of this author's: title, slug, how many slides, whether it is published, and where it lives.",
    properties: {},
    run: (_a, h) => h.send("GET", "/api/decks"),
  },
  {
    name: "deck_schema",
    description:
      "What a deck and a card may hold, with examples and every value they choose from. Read this before writing slides for the first time.",
    properties: {},
    run: async () => SCHEMA,
  },
  {
    name: "list_examples",
    description: "The decks a new one can be started from, by name — pass one as create_deck's `from`.",
    properties: {},
    run: async (_a, h) => ({ examples: examplesOf(h.config) }),
  },
  {
    name: "create_deck",
    description:
      "Make a deck. It starts empty unless `from` names an example, in which case it starts as a copy of that one, pictures and all. It is a draft until publish is called.",
    properties: {
      title: str("The name of the deck, which is also its address unless you change it."),
      from: str("An example to start from, from list_examples. Omit for an empty deck."),
    },
    required: ["title"],
    run: (a, h) => h.send("POST", "/api/decks", { title: a.title, from: a.from ?? "blank" }),
  },
  {
    name: "read_deck",
    description:
      "A deck's whole draft — every slide, in order — with its address, its edit address, its revision and whether it has changes not yet published.",
    properties: { deck: WHICH },
    required: ["deck"],
    run: async (a, h) => h.send("GET", `/api/decks/${(await h.deck(a.deck)).id}`),
  },
  {
    name: "add_slide",
    description:
      "Add a slide. It goes at the end unless `after` says otherwise: after 0 puts it first, after 2 makes it the third.",
    properties: {
      deck: WHICH,
      slide: SLIDE,
      after: int("The slide it follows. Omit to put it at the end."),
      rev: REV,
    },
    required: ["deck", "slide"],
    run: async (a, h) => {
      const d = await h.deck(a.deck);
      /* The end is where a slide almost always goes, and asking for it
         should not cost the assistant a read it then has to count. */
      const after = a.after ?? (await h.send("GET", `/api/decks/${d.id}`)).slides;
      return h.send("POST", `/api/decks/${d.id}/slides`, { slide: a.slide, after, rev: a.rev });
    },
  },
  {
    name: "write_slide",
    description: "Replace slide `n` with this one. The whole card is written, so send every field it should keep.",
    properties: { deck: WHICH, n: int("Which slide, counting from 1."), slide: SLIDE, rev: REV },
    required: ["deck", "n", "slide"],
    run: async (a, h) =>
      h.send("PUT", `/api/decks/${(await h.deck(a.deck)).id}/slides/${a.n}`, { slide: a.slide, rev: a.rev }),
  },
  {
    name: "remove_slide",
    description: "Take slide `n` out of the deck.",
    properties: { deck: WHICH, n: int("Which slide, counting from 1."), rev: REV },
    required: ["deck", "n"],
    run: async (a, h) =>
      h.send("DELETE", `/api/decks/${(await h.deck(a.deck)).id}/slides/${a.n}`, { rev: a.rev }),
  },
  {
    name: "move_slide",
    description: "Move a slide so that it becomes slide `to`.",
    properties: {
      deck: WHICH,
      from: int("The slide to move, counting from 1."),
      to: int("The place it should end up, counting from 1."),
      rev: REV,
    },
    required: ["deck", "from", "to"],
    run: async (a, h) =>
      h.send("POST", `/api/decks/${(await h.deck(a.deck)).id}/slides/${a.from}/move`, { to: a.to, rev: a.rev }),
  },
  {
    name: "set_fields",
    description:
      `The deck's own settings, not its slides: ${Object.keys(DECK).join(", ")}. Only what you send is changed.`,
    properties: {
      deck: WHICH,
      set: { type: "object", description: "The fields to write, as an object. See deck_schema for the values each takes." },
      rev: REV,
    },
    required: ["deck", "set"],
    run: async (a, h) =>
      h.send("PATCH", `/api/decks/${(await h.deck(a.deck)).id}/fields`, { set: a.set, rev: a.rev }),
  },
  {
    name: "replace_draft",
    description:
      "Replace the whole draft with this deck — every slide at once. Good for laying out a deck in one go; for a change to one slide, write_slide is cheaper and safer.",
    properties: {
      deck: WHICH,
      document: { type: "object", description: "The whole deck: { title?, slides: [...] }. See deck_schema." },
      rev: REV,
    },
    required: ["deck", "document"],
    run: async (a, h) =>
      h.send("PUT", `/api/decks/${(await h.deck(a.deck)).id}/draft`, { deck: a.document, rev: a.rev }),
  },
  {
    name: "deck_settings",
    description: "The deck's title, its address, or who may see it. Only what you send is changed.",
    properties: {
      deck: WHICH,
      title: str("A new title."),
      slug: str("A new address: lowercase words joined by hyphens."),
      visibility: {
        type: "string",
        enum: ["public", "unlisted", "private"],
        description: "Who may see the published wall: anyone, anyone with the link, or only its author.",
      },
    },
    required: ["deck"],
    run: async (a, h) =>
      h.send("PATCH", `/api/decks/${(await h.deck(a.deck)).id}`, {
        title: a.title,
        slug: a.slug,
        visibility: a.visibility,
      }),
  },
  {
    name: "publish",
    description: "Put the draft at the deck's public link. Until this is called, nothing that was written is visible there.",
    properties: { deck: WHICH, rev: REV },
    required: ["deck"],
    run: async (a, h) => h.send("POST", `/api/decks/${(await h.deck(a.deck)).id}/publish`, { rev: a.rev }),
  },
  {
    name: "discard",
    description: "Throw the draft away and go back to what is published.",
    properties: { deck: WHICH },
    required: ["deck"],
    run: async (a, h) => h.send("POST", `/api/decks/${(await h.deck(a.deck)).id}/discard`, {}),
  },
  {
    name: "list_versions",
    description: "Every version of this deck that was published, newest first.",
    properties: { deck: WHICH },
    required: ["deck"],
    run: async (a, h) => h.send("GET", `/api/decks/${(await h.deck(a.deck)).id}/versions`),
  },
  {
    name: "restore_version",
    description: "Put a published version back into the draft. Nothing is published by this; call publish after it.",
    properties: { deck: WHICH, rev: int("The version, from list_versions.") },
    required: ["deck", "rev"],
    run: async (a, h) =>
      h.send("POST", `/api/decks/${(await h.deck(a.deck)).id}/versions/${a.rev}/restore`, {}),
  },
  {
    name: "delete_deck",
    description: "Delete a deck and its pictures. This cannot be undone — ask the author first.",
    properties: { deck: WHICH },
    required: ["deck"],
    run: async (a, h) => h.send("DELETE", `/api/decks/${(await h.deck(a.deck)).id}`, {}),
  },
];

/* One prompt, so an author with a client that shows them can type
   `/slide a heading, and three bullets` instead of a sentence. There
   is nothing to parse: what they type goes to their own assistant,
   which already knows how to turn it into a card. */
const SLIDE_PROMPT = {
  name: "slide",
  description: "Add a slide to the deck being worked on, from a few words.",
  arguments: [{ name: "text", description: "What goes on the card.", required: false }],
};
const PROMPTS = [SLIDE_PROMPT];

/* ------------------------------------------------------------------
   The envelope
------------------------------------------------------------------ */

const answer = (/** @type {unknown} */ id, /** @type {unknown} */ result) => ({ jsonrpc: "2.0", id, result });
const complaint = (/** @type {unknown} */ id, /** @type {number} */ code, /** @type {string} */ message) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});
const text = (/** @type {unknown} */ v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

/**
 * The handler for POST /api/mcp.
 * @param {object} deps
 * @param {Hono} deps.app this same server, to dispatch a tool back through
 * @param {import("./config.js").Config} deps.config
 * @param {(c: Context) => { user: import("./auth.js").User | null, viaToken: boolean }} deps.seenOf
 */
export function mcpRoute({ app, config, seenOf }) {
  /** @param {Context} c */
  return async function mcp(c) {
    /* A token, not a cookie: a page on some other site must not be
       able to drive this with the author's browser. 401 rather than a
       protocol error, because that is the word a client listens for. */
    const { user, viaToken } = seenOf(c);
    if (!user || !viaToken)
      return c.json({ error: "this needs a token — make one at /developers and send it as `Authorization: Bearer …`" }, 401);

    const body = await c.req.json().catch(() => null);
    if (Array.isArray(body)) return c.json(complaint(null, -32600, "one request at a time, not a batch"), 400);
    if (!body || typeof body !== "object") return c.json(complaint(null, -32700, "that was not a JSON-RPC request"), 400);

    const id = body.id ?? null;
    const method = String(body.method ?? "");
    const params = body.params && typeof body.params === "object" ? body.params : {};

    // a notification is spoken at, not asked; there is nothing to say back
    if (body.id === undefined || method.startsWith("notifications/")) return c.body(null, 202);

    const authorization = c.req.header("authorization") ?? "";

    /** @type {Hands["send"]} */
    const send = async (verb, route, payload) => {
      const res = await app.request(route, {
        method: verb,
        headers: { authorization, "content-type": "application/json" },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
      const out = /** @type {Record<string, any>} */ (await res.json().catch(() => ({})));
      if (!res.ok) throw new Error(out.error || `the wall answered ${res.status}`);
      return out;
    };

    /* The author's decks, read at most once however many times a tool
       names one. A slug is what an assistant will have; an id is what
       a route wants. */
    /** @type {Record<string, any>[] | null} */
    let mine = null;
    /** @type {Hands["deck"]} */
    const deck = async (v) => {
      const want = String(v ?? "").trim();
      mine ??= /** @type {Record<string, any>[]} */ ((await send("GET", "/api/decks")).decks);
      const found = mine.find((d) => d.id === want || d.slug === want);
      if (!found)
        throw new Error(
          want
            ? `no deck of yours called "${want}". There is ${mine.length ? mine.map((d) => `"${d.slug}"`).join(", ") : "none yet — create_deck makes one"}.`
            : "which deck? Give its slug; list_decks has them.",
        );
      return found;
    };

    try {
      switch (method) {
        case "initialize":
          return c.json(
            answer(id, {
              protocolVersion: SPOKEN.includes(params.protocolVersion) ? params.protocolVersion : SPOKEN[0],
              capabilities: { tools: {}, prompts: {} },
              serverInfo: { name: NAME, version: VERSION, title: "Storyboard" },
              instructions: INSTRUCTIONS,
            }),
          );

        case "ping":
          return c.json(answer(id, {}));

        case "tools/list":
          return c.json(
            answer(id, {
              tools: TOOLS.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: {
                  type: "object",
                  properties: t.properties,
                  ...(t.required ? { required: t.required } : {}),
                },
              })),
            }),
          );

        case "tools/call": {
          const tool = TOOLS.find((t) => t.name === params.name);
          if (!tool) return c.json(complaint(id, -32602, `no tool called ${params.name}`), 200);
          /* What the tool says, said or refused, goes back as a result
             either way: a refusal is for the assistant to read and act
             on, not a fault in the conversation. */
          try {
            const out = await tool.run(params.arguments ?? {}, { send, deck, config });
            return c.json(answer(id, { content: [{ type: "text", text: text(out) }] }));
          } catch (err) {
            const said = err instanceof Error ? err.message : String(err);
            return c.json(answer(id, { content: [{ type: "text", text: said }], isError: true }));
          }
        }

        case "prompts/list":
          return c.json(answer(id, { prompts: PROMPTS }));

        case "prompts/get": {
          if (params.name !== "slide") return c.json(complaint(id, -32602, `no prompt called ${params.name}`), 200);
          const said = String(params.arguments?.text ?? "").trim();
          return c.json(
            answer(id, {
              description: SLIDE_PROMPT.description,
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: said
                      ? `Add a slide to the Storyboard deck we are working on, with add_slide, from these words: ${said}`
                      : "Add a slide to the Storyboard deck we are working on, with add_slide, from what I say next.",
                  },
                },
              ],
            }),
          );
        }

        default:
          return c.json(complaint(id, -32601, `this server does not answer ${method}`), 200);
      }
    } catch (err) {
      if (!config.dev) console.error(err);
      return c.json(complaint(id, -32603, err instanceof Error ? err.message : "something went wrong"), 200);
    }
  };
}

/** The decks a new one can start from: the offered ones first, then the rest. */
function examplesOf(/** @type {import("./config.js").Config} */ config) {
  const known = new Set(exampleNames(config.root));
  return [
    ...TEMPLATES.filter((t) => known.has(t.name)),
    ...[...known]
      .filter((n) => !TEMPLATES.some((t) => t.name === n))
      .map((name) => ({ name, title: name, blurb: "" })),
  ];
}
