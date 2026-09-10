/* A roadmap, a year on one wall.

   A heading painted on the plaster for each quarter and the bets
   pinned under it, so the wide shot is the roadmap and each stop is
   one quarter. Change the quarters, keep the shape. */

import { defineDeck } from "../../src/deck/types.js";

export default defineDeck({
  title: "Roadmap",
  subtitle: "the next four quarters, on one wall",
  seed: "roadmap",

  slides: [
    {
      mural: "Roadmap",
      sub: "four quarters, three bets each",
      say: "The whole year is on the wall behind you. Walk it one quarter at a time.",
    },

    {
      title: "Where we are",
      table: {
        head: ["", "Now", "Goal"],
        rows: [
          ["Active teams", "120", "500"],
          ["Weekly retention", "38%", "55%"],
          ["Time to first list", "9 min", "2 min"],
        ],
      },
      foot: "Numbers from the first week of the quarter.",
      say: "Three numbers. Everything on the wall should move one of them.",
      paper: "graph",
      font: "sans",
    },

    { mural: "Q1", sub: "make the first day work", paint: "#4a1c1a" },

    {
      notes: [
        {
          title: "Onboarding in two minutes",
          text: "Connect one source, see one list, before the tour is over.",
          say: "The first quarter is about the first day. Nothing else gets in.",
          paper: "classic",
        },
        {
          title: "Comments on any line",
          text: "The thing every trial asks for in the first hour.",
          paper: "pastelPink",
        },
        {
          title: "Kill the settings page",
          text: "Every setting becomes a default or disappears.",
          paper: "kraft",
        },
      ],
    },

    { mural: "Q2", sub: "make it worth coming back", paint: "#3b3527" },

    {
      notes: [
        {
          title: "The weekly digest",
          text: "What changed, who changed it, written for someone who was away.",
        },
        {
          title: "Mobile, properly",
          text: "Read and edit on the phone without a smaller version of the desktop.",
          paper: "pastelGreen",
        },
        {
          title: "Search",
          text: "Across every list, including the ones you left.",
          paper: "notebook",
        },
      ],
    },

    { mural: "Q3", sub: "make it a team thing", paint: "#2f3137" },

    {
      notes: [
        {
          title: "Shared lists",
          text: "One list, many teams, one owner per line.",
        },
        {
          title: "Permissions that fit on a card",
          text: "Owner, editor, reader. If a fourth is needed, we were wrong.",
          paper: "pastelPurple",
        },
        {
          title: "The API",
          text: "Once three customers have asked. Two have.",
          paper: "torn",
        },
      ],
    },

    { mural: "Q4", sub: "make it pay", paint: "#6d5334" },

    {
      notes: [
        {
          title: "Team plan",
          text: "Priced per team, not per seat, because that is how people buy it.",
          say: "The last quarter pays for the first three. Say that plainly.",
          paper: "kraft",
        },
        {
          title: "Usage that tells us the truth",
          text: "Which lists are alive, which teams are drifting, before they leave.",
        },
      ],
    },

    {
      title: "How we decide",
      bullets: [
        "A bet moves one of the three numbers, or it is not on the wall",
        "Three bets a quarter; a fourth replaces one",
        "Every quarter ends with this deck updated, not a new one",
      ],
      say: "This card is the one people remember, because it explains every other card.",
      doodle: "star",
    },
  ],
});
