/* The deck this wall presents.

   Point this at whichever deck you want to show. Everything under
   `examples/` is a working deck — copy one, or re-export it from here.

   `onboarding` is the tour of the wall, given on the wall: every
   feature, one stop each, with a picture of the real thing. It is what
   the project opens on.
   `hello-wall` is the short tour: every kind of card, and how to write it.
   `lighthouse-bakery` is a full-length deck, fifteen stops long.

   Or start from nothing: `export default { title: "My wall", slides: [] }`
   is a bare wall, and pressing `e` on it adds the first slide. */

export { default } from "./examples/onboarding/deck.config.js";
