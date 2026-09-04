/* Lighthouse Bakery — a year, on the wall.

   The long example: a deck the length of a real talk, so you can see
   what a wall looks like once it has three rows of chapters on it —
   headings painted between the paper, stops that hold two or three
   cards, tables, and pictures that stay the shape they were taken in.

   Everything in it is made up. The bakery does not exist; the captures
   under public/demo/ are drawings of screens nobody runs. Copy the
   file, keep the shape, replace the words. */

import { defineDeck } from "../../src/deck/types.js";

export default defineDeck({
  title: "Lighthouse Bakery",
  subtitle: "a year on the wall…",
  seed: "flour",

  slides: [
    {
      mural: "Lighthouse Bakery",
      sub: "the year we stopped running out by ten",
      paint: "#3b3527",
      say: "Hold the wide shot for a beat. Let them see it is a year, not a slide.",
    },

    {
      title: "Where we started",
      text: "One oven, two bakers, and a queue that gave up at half past nine.",
      bullets: [
        "Sold out by 09:40 most days — the wrong kind of success",
        "No way to know what would sell before it was baked",
        "Wholesale orders kept in a notebook, by the till",
      ],
      say: "Open on the queue. Everyone has stood in one.",
      paper: "notebook",
      attach: "clip",
    },

    {
      mural: "Winter",
      sub: "learning what the town eats",
      paint: "#4a1c1a",
    },

    {
      notes: [
        {
          image: "demo/capture-dashboard.svg",
          caption: "The first thing we could see",
          title: "Sales, by month",
          text: "A dashboard on the office wall, updated every night.",
        },
        {
          title: "What it told us",
          text: "Tuesdays were dead, Saturdays were chaos, and nobody bought the rye.",
          bullets: ["Bake less on Tuesday", "Bake more on Saturday", "Retire the rye"],
          paper: "graph",
          doodle: "arrow",
        },
      ],
    },

    {
      title: "The Tuesday problem",
      table: {
        head: ["Day", "Baked", "Sold", "Waste"],
        rows: [
          ["Mon", "380", "352", "7%"],
          ["Tue", "380", "290", "24%"],
          ["Wed", "380", "361", "5%"],
          ["Sat", "380", "380", "0% — and a queue"],
        ],
      },
      foot: "A week in January. The same 380 loaves every day.",
      say: "Land on the Tuesday line. Twenty-four percent in the bin.",
      paper: "classic",
      font: "sans",
    },

    {
      mural: "Spring",
      sub: "baking to the day, not the recipe",
      paint: "#2f5d8a",
    },

    {
      notes: [
        {
          title: "A bake sheet per day",
          text: "Monday is not Saturday. Each day got its own numbers, revised every week from what actually sold.",
          bullets: ["Tuesday: 290 → 300", "Saturday: 380 → 520", "Rye: gone. Caraway: back"],
          paper: "kraft",
        },
        {
          title: "Waste, after",
          text: "From a fifth of the bake on the worst day to three loaves in a hundred.",
          foot: "3.1% across the year, measured at close.",
          paper: "pastelGreen",
          doodle: "star",
        },
      ],
    },

    {
      notes: [
        {
          image: "demo/capture-phone.svg",
          caption: "Reserve a loaf before it is gone",
          title: "The reservation page",
          text: "A phone page: what is baked, what is left, and one button.",
        },
        {
          title: "Reservations",
          text: "Regulars stopped queueing. The queue got shorter, and the till got busier.",
          bullets: [
            "1,208 regulars by December",
            "A third of the morning bake reserved before we open",
            "No app — a page, a link, a name",
          ],
          paper: "pastelPink",
          attach: "tape",
        },
      ],
    },

    {
      mural: "Summer",
      sub: "the market, and the wholesale book",
      paint: "#6d5334",
    },

    {
      notes: [
        {
          image: "demo/capture-table.svg",
          caption: "Six customers, 244 loaves a week",
          title: "The wholesale book, as a table",
          text: "The notebook by the till became a list with a status column.",
        },
        {
          title: "What changed",
          text: "Nothing about the bread. Everything about knowing where it was going.",
          bullets: [
            "Standing orders instead of morning phone calls",
            "A van route that follows the table",
            "One late delivery in August — it is on the wall",
          ],
          paper: "torn",
          font: "serif",
        },
      ],
    },

    {
      title: "The market stall",
      text: "Ninety loaves before six on a Saturday, and the stall paid for the van by September.",
      say: "This is the number to slow down on: ninety, before six.",
      paper: "notebook",
      doodle: "heart",
    },

    {
      mural: "Autumn",
      sub: "what we would tell another bakery",
      paint: "#4a1c1a",
    },

    {
      notes: [
        {
          title: "Bake to the day",
          text: "The recipe is the same every morning. The number is not.",
          paper: "classic",
        },
        {
          title: "Let people reserve",
          text: "The people who love you most were the ones stuck in the queue.",
          paper: "pastelPurple",
        },
        {
          title: "Write the orders down",
          text: "Somewhere with a status column, that the van can read.",
          paper: "kraft",
        },
      ],
    },

    {
      title: "The year in four lines",
      table: {
        head: ["", "January", "December"],
        rows: [
          ["Loaves a day", "380", "412"],
          ["Sold out by", "09:40", "14:10"],
          ["Waste", "11%", "3.1%"],
          ["Regulars", "—", "1,208"],
        ],
      },
      foot: "Same oven. Same two bakers.",
      say: "Read the sold-out line out loud. Fourteen ten. That was the whole point.",
      font: "sans",
    },

    {
      mural: "Thank you",
      sub: "the bread is by the door",
      paint: "#3b3527",
      rule: false,
    },
  ],
});
