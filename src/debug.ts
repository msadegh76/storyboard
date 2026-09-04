/* A live handle on the wall, for measuring it from the console.

   Off unless the page is opened with ?debug — a published deck should
   not carry an inspection surface it never uses. */

import { cam, camera, scene, renderer } from "./scene/stage.js";
import { cards } from "./scene/card.js";
import { STORY, promises } from "./deck/state.js";
import { beats, cardsBox, storyFrame } from "./deck/story.js";

declare global {
  interface Window {
    /** Present only when the page was opened with ?debug. */
    __d?: DebugHandle;
  }
}

export interface DebugHandle {
  cam: typeof cam;
  camera: typeof camera;
  scene: typeof scene;
  renderer: typeof renderer;
  cards: typeof cards;
  STORY: typeof STORY;
  promises: typeof promises;
  cardsBox: typeof cardsBox;
  storyFrame: typeof storyFrame;
  beats: () => typeof beats;
  stops: () => string[];
}

export function initDebug() {
  if (!new URLSearchParams(location.search).has("debug")) return;
  window.__d = {
    cam,
    camera,
    scene,
    renderer,
    cards,
    STORY,
    promises,
    cardsBox,
    storyFrame,
    beats: () => beats,
    stops: () =>
      STORY.map((b) =>
        b.overview ? "OV" : `${b.slide}:${b._gs?.length ?? 0}`,
      ),
  };
}
