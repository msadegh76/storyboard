import { clamp } from "./util.js";

/* Every tunable the wall has, in one place.

   Distances are in "wall units" — the same units the deck is authored
   in — never screen pixels, so a composition survives any viewport. */

/* ---- the room ---------------------------------------------------- */
export const WALL_W = 64; // logical pin area the card clamps use
export const WALL_H = 40;
export const ROOM_W = 220; // the plaster runs far past any camera
export const FLOOR_Y = -21;
export const WALL_TOP = 62;

/* ---- textures ---------------------------------------------------- */
/* A focused promise fills ~90% of the frame, so paper is drawn at twice
   the layout resolution; every draw call still works in 512-space. */
export const SS = 2;

/* ---- cards ------------------------------------------------------- */
/* How far the wall's own writing sits back into the plaster while no
   stop is on it — above 1 it reads a shade lighter than the ink. */
export const MURAL_REST = 1.1;
/* ...and how far paper sits back while no stop is on it. A stop brings
   a card up to full colour; everything else holds a shade behind it, so
   the eye lands where the deck is. */
export const PAPER_REST = 0.74;

/* ---- layout ------------------------------------------------------ */
export const MIN_GAP = 1.1; // clear wall between unrelated promises
export const GROUP_GAP = 0.45; // ...and between two that share a stop

/* The board the deck is read onto: as wide as the eye can hold in one
   overview, filled left to right and then down a row. A deck longer
   than the rows below simply reaches further down the wall. */
export const BOARD_W = 56; // the widest a row may run
export const ROW_TOP = 17; // and the highest the first row may hang
export const ROW_PITCH = 8; // the drop from one row to the next
export const BOARD_BOTTOM = -19.5;
export const MAX_ROWS = 12;
/* The shape the board aims for: the shape of the screen it will be read
   on, so the opening overview fills the frame rather than showing bare
   plaster above and below a thin strip of cards.

   A phone held upright is the case this exists for. Laid out to a fixed
   landscape shape, a deck on a phone becomes a wide board seen through a
   tall window — the camera cannot pull back far enough to hold it, and
   most of the wall falls outside the frame. Following the viewport
   instead gives a portrait screen a portrait board: fewer cards to a
   row, more rows, and every stop small enough to fill. Clamped at both
   ends so an extreme window still gets a board someone could read. */
export const boardAspect = () => clamp(innerWidth / innerHeight, 0.55, 1.9);

/* ---- the deck ---------------------------------------------------- */
export const FILL = 0.9; // how much of the frame a focused promise takes
export const STORY_LIFT = 0.55; // how far it lifts off the wall while focused
