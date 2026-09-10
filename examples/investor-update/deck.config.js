/* An investor update, in eight stops.

   The number, the wins, the misses, what was learned, the runway, the
   asks. Sent as a link, read in two minutes, walked again by whoever
   wants the detail. Numbers here are made up; the shape is not. */

import { defineDeck } from "../../src/deck/types.js";

export default defineDeck({
  title: "September update",
  subtitle: "eight stops, two minutes",
  room: "studio",
  seed: "update",

  slides: [
    {
      mural: "September",
      sub: "the monthly update",
      say: "Open with the month. They get twelve of these; make this one easy to place.",
    },

    {
      title: "The number",
      table: {
        head: ["", "August", "September", "Change"],
        rows: [
          ["Revenue", "18.2k", "21.9k", "+20%"],
          ["Active teams", "96", "120", "+25%"],
          ["Churned teams", "4", "3", "−1"],
        ],
      },
      foot: "Monthly recurring, in USD, at the end of the month.",
      say: "One table. If they read nothing else, they read this.",
      paper: "graph",
      font: "sans",
    },

    {
      title: "Wins",
      bullets: [
        "The onboarding rewrite: first list in three minutes, from eleven",
        "Two design partners signed for the team plan",
        "Hired the second engineer; started on the 2nd",
      ],
      say: "Three wins, and the third one is a person. It always should be.",
      paper: "pastelGreen",
      doodle: "star",
    },

    {
      title: "Misses",
      bullets: [
        "Mobile slipped a month; the phone editor is not good enough to ship",
        "Lost a design partner to a tool they already paid for",
        "The digest is late because the data was wrong first",
      ],
      say: "Say the misses in the same voice as the wins. That is the whole trick.",
      paper: "torn",
    },

    {
      title: "What we learned",
      text: "Teams do not switch tools; they add one and let the old one die. Our job is to be worth adding.",
      say: "One lesson, one sentence. If there are two, pick the one that changed a decision.",
      paper: "classic",
      attach: "clip",
    },

    {
      title: "Runway",
      table: {
        head: ["", "Now"],
        rows: [
          ["Cash", "410k"],
          ["Burn, monthly", "31k"],
          ["Runway", "13 months"],
          ["Default alive", "May, at current growth"],
        ],
      },
      foot: "Default alive: the month revenue covers burn if growth holds.",
      paper: "notebook",
      font: "sans",
    },

    {
      title: "Asks",
      bullets: [
        "An intro to anyone running product at a company of two hundred",
        "A second opinion on per-team pricing, from someone who has done it",
        "Nothing else. Nothing else is the ask.",
      ],
      say: "Two asks. Specific enough that someone can act on them today.",
      paper: "kraft",
      doodle: "arrow",
    },

    {
      mural: "Thank you",
      sub: "reply to this link with anything at all",
      say: "Close the loop. Every reply is a data point.",
    },
  ],
});
