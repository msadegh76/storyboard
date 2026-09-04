/* The deck this wall presents.

   Point this at whichever deck you want to show. Everything under
   `examples/` is a working deck — copy one, or re-export it from here.

   `hello-wall` is the tour: every kind of card, and how to write it.
   `lighthouse-bakery` is a full-length deck, fifteen stops long.

   Or start from nothing: `export default { title: "My wall", slides: [] }`
   is a bare wall, and pressing `e` on it adds the first slide. */

export { default } from "./examples/lighthouse-bakery/deck.config.js";
