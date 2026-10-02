/* The renderer, the camera, and the lights it sees by.

   `cam` is where the camera is being asked to go; the main loop
   springs the real camera toward it every frame. */

import { THREE } from "../vendor.js";
import type { Room } from "../rooms.js";
import { wake } from "./wake.js";

const found = document.getElementById("scene");
if (!(found instanceof HTMLCanvasElement))
  throw new Error('storyboard: index.html needs a <canvas id="scene">');
export const canvas = found;
export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  /* The integrated GPU, where there is a choice. A wall is paper and
     plaster; it does not need the one that turns the fan on. */
  powerPreference: "low-power",
});
/* At most one and a half device pixels per CSS pixel: on a 2× screen
   that is four ninths of the pixels of a full 2× frame, and handwriting
   drawn into a texture stays sharp either way. */
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
/* Shadows are redrawn only on frames where something moved — the loop
   says when. A card swaying a third of a degree does not move its
   shadow enough to see. */
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

export const scene = new THREE.Scene();
scene.background = new THREE.Color("#ddd4c2");
/* The aspect is set for real by fitCamera() before the first frame; a
   window still being made can report no size at all here, and 0 / 0 is
   NaN — which would have gone into every framing after it. */
export const camera = new THREE.PerspectiveCamera(
  38,
  Math.max(1, innerWidth) / Math.max(1, innerHeight),
  0.1,
  200,
);
export const cam = { x: 0, y: 0, z: 34, tx: 0, ty: 0, tz: 34 };
camera.position.set(0, 0, 34);

/* Fit the camera to the window — less whatever is sitting over its
   right edge.

   The dev-mode editor is a panel over the wall, and a stop framed for
   the whole window would be framed half under it. So the camera is
   told how much of the window is not the wall's, and frames for what
   is left: the projection is that of the uncovered part, extended
   rightward so the strip under the panel still shows the wall going
   on. Everything that reads `camera.aspect` — the framing of a stop,
   the wide shot — sees the uncovered width and lands the stop in the
   middle of it.

   @param rightInset pixels covered on the right; omit to keep the last */
let inset = 0;
export function fitCamera(rightInset = inset) {
  inset = rightInset;
  // a window being made can report no size for a frame; never divide by it
  const h = Math.max(1, innerHeight);
  const w = Math.max(240, innerWidth - inset);
  camera.aspect = w / h;
  if (inset > 0 && w < innerWidth)
    camera.setViewOffset(w, h, 0, 0, innerWidth, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  wake();
}

/* Every intensity here carries a factor of 4.1 that has nothing to do
   with the room. Physically-correct lighting stopped being optional
   partway through three's life — there is no switch left to turn it
   off — and it interprets a light's `intensity` on a different scale
   than the legacy model this scene was lit under. The numbers in
   comments are what each light was written as before the wall's
   three.js was upgraded; the factor was found by rendering the same
   four camera positions before and after and solving for the exposure
   that put every one of them back within 2% of its old luminance. */
const LIGHT = 4.1;
const hemi = new THREE.HemisphereLight(0xfff4e2, 0x8d7d64, 0.8 * LIGHT); // 0.8
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1dc, 0.95 * LIGHT); // 0.95
key.position.set(14, 18, 26);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); // soft shadows over an 80-unit wall need no more
key.shadow.camera.left = -40;
key.shadow.camera.right = 40;
key.shadow.camera.top = 26;
key.shadow.camera.bottom = -32;
key.shadow.camera.near = 2;
key.shadow.camera.far = 80;
key.shadow.bias = -0.0006;
key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.PointLight(0xffd9ad, 0.22 * LIGHT, 90, 1); // 0.22
fill.position.set(-18, 4, 20);
scene.add(fill);

/** Light the scene the way the room is lit — see rooms.ts. The lights
    above are the plaster room's; a deck that hangs elsewhere recolours
    them here, once, before the wall is built. */
export function lightRoom(room: Room) {
  hemi.color.set(room.light.sky);
  hemi.groundColor.set(room.light.ground);
  hemi.intensity = room.light.ambient * LIGHT;
  key.color.set(room.light.key);
  key.intensity = room.light.keyStrength * LIGHT;
  fill.color.set(room.light.fill);
  fill.intensity = room.light.fillStrength * LIGHT;
  renderer.toneMappingExposure = room.light.exposure;
  scene.background = new THREE.Color(room.background);
}
