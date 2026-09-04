/* The pointer is read only for the slow parallax drift of the camera.
   The wall is not draggable; it is a deck. */

import { THREE } from "../vendor.js";

export const ndc = new THREE.Vector2();
addEventListener("pointermove", (e) => {
  ndc.x = (e.clientX / innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / innerHeight) * 2 + 1;
});
