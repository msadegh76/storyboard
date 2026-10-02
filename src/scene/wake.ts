/* Whether the wall has anything to draw.

   The loop used to render sixty times a second whether or not anything
   had changed, which is what kept a laptop warm under a wall that was
   just sitting there. Now a frame is drawn at full rate only while
   something is moving — the camera on its way to a stop, a card
   lifting, a hand on the pointer — and otherwise at a slow tick that
   keeps the sway and the dust alive.

   Two things can say "something is moving": the loop itself, which
   can see whether its springs have settled, and anything that changes
   the scene from outside, which calls `wake`. Any input at all wakes
   the wall for a moment, so nothing that follows a click or a key can
   be missed. */

let activeUntil = 0;

/** Draw at full rate for the next while. */
export function wake(ms = 600) {
  activeUntil = Math.max(activeUntil, performance.now() + ms);
}

/** Whether something outside the loop asked for full rate recently. */
export const awake = (now: number) => now < activeUntil;

for (const ev of ["pointermove", "pointerdown", "pointerup", "keydown", "wheel", "touchstart", "touchmove", "resize", "focus"])
  addEventListener(ev, () => wake(), { passive: true, capture: true });
