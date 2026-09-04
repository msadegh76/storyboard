/* Which card is under the pointer.

   One place knows how to answer that, because two want to ask: the walk,
   where clicking a card means "take me to it", and the dev-mode editor,
   where it means "this is the one I am moving". */

import { THREE } from "../vendor.js";
import { camera } from "./stage.js";
import { cards } from "./card.js";
import type { CardGroup } from "./card.js";

const ray = new THREE.Raycaster();
const at = new THREE.Vector2();

/** Aim the shared ray at a point on screen. */
export function aim(clientX: number, clientY: number) {
  at.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(at, camera);
  return ray;
}

/**
 * The card under a point on screen, or undefined for bare plaster.
 *
 * A card is a group of several meshes — the sheet, a pin, a strip of
 * tape — so the hit has to be walked back up to whichever group owns
 * it. `among` narrows the search: the editor only cares about the
 * cards in the stop it is showing.
 *
 * @param clientX where the pointer is
 * @param clientY where the pointer is
 * @param among the cards worth hitting; the whole wall by default
 */
export function cardAt(
  clientX: number,
  clientY: number,
  among: CardGroup[] = cards,
): CardGroup | undefined {
  if (!among.length) return undefined;
  const hit = aim(clientX, clientY).intersectObjects(among, true)[0];
  if (!hit) return undefined;
  let node: import("three").Object3D | null = hit.object;
  while (node && !among.includes(node as CardGroup)) node = node.parent;
  return (node as CardGroup) ?? undefined;
}
