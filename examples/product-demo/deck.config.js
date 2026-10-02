/* A product demo, in ten stops.

   The shape most demos want: the problem, who has it, the product in
   three captures, how it works, what it costs, what is next. The
   captures under public/demo/ are drawings of screens nobody runs —
   drop your own on the wall and they take their place. */

import { defineDeck } from "../../src/deck/types.js";

export default defineDeck({
  title: "Product demo",
  subtitle: "what it does, in ten stops",
  room: "studio",
  seed: "demo",

  slides: [
    {
      mural: "Product demo",
      sub: "what it does, and why now",
      say: "Say the name, say the one sentence, and let the wall do the rest.",
    },

    {
      title: "The problem",
      text: "Every team keeps the same list in three places, and none of them is right.",
      bullets: [
        "The spreadsheet is the truth, until someone edits the doc",
        "Status is asked in chat, answered from memory",
        "The weekly meeting exists to find out what the tool should know",
      ],
      say: "Open on the pain. Everyone in the room has lived this one.",
      paper: "classic",
    },

    {
      title: "Who it is for",
      bullets: [
        "Product managers running one team or six",
        "Founders who still do the update themselves",
        "Anyone who has rebuilt the same tracker twice",
      ],
      foot: "Not for: enterprises that need a workflow engine.",
      say: "Be specific about who it is not for. It is the most credible thing you can say.",
      paper: "graph",
    },

    {
      notes: [
        {
          image: "demo/capture-dashboard.svg",
          caption: "The dashboard, on a Monday",
        },
        {
          title: "One screen",
          text: "Everything that changed since you last looked, in the order it matters.",
          say: "This is the screen. Pause here. Let them read it.",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/capture-phone.svg",
          caption: "The same list, on the phone",
        },
        {
          title: "On the phone",
          text: "Read it in the lift. Change it in the queue for coffee.",
          paper: "pastelGreen",
        },
      ],
    },

    {
      title: "How it works",
      bullets: [
        "Connect the places the list already lives",
        "Say which one wins when they disagree",
        "Read one list, and stop asking in chat",
      ],
      say: "Three steps. If it needs a fourth, cut the feature.",
      paper: "notebook",
      attach: "clip",
    },

    {
      notes: [
        {
          image: "demo/capture-table.svg",
          caption: "Where the time goes, by week",
        },
        {
          title: "The numbers",
          text: "Meetings down by a third in the first month, on the teams that switched.",
          foot: "Six teams, eight weeks. Ask for the data.",
        },
      ],
    },

    {
      title: "What it costs",
      table: {
        head: ["Plan", "For", "Per month"],
        rows: [
          ["Free", "one team", "0"],
          ["Team", "up to six", "40"],
          ["Company", "all of them", "ask"],
        ],
      },
      foot: "Nothing to install. Cancel from the same page you paid on.",
      say: "Say the price out loud and then stop talking.",
      paper: "kraft",
    },

    {
      title: "What is next",
      bullets: [
        "Comments on any line, this quarter",
        "A weekly digest that writes itself",
        "The API, when three customers ask for it",
      ],
      say: "A roadmap with three things on it is a roadmap someone believes.",
      doodle: "arrow",
    },

    {
      mural: "Thank you",
      sub: "the link you were sent is the demo — walk it again",
      say: "End on the link. The deck is the leave-behind.",
    },
  ],
});
