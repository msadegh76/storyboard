/* One frame: spring the camera, settle every card, drift the dust. */

import { REDUCED } from "../util.js";
import { MURAL_REST, PAPER_REST, STORY_LIFT } from "../config.js";
import { cam, camera, scene, renderer } from "./stage.js";
import { cards } from "./card.js";
import { dust, dustN, dv } from "./room.js";
import { ndc } from "./pointer.js";
import { storyReframe } from "../deck/story.js";

let last = performance.now();
export function loop(now: number) {
  requestAnimationFrame(loop);
  // capped so a backgrounded tab cannot jump the camera on return,
  // but loose enough that a slow projector still tracks real time
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  // camera spring, framed in seconds so the walk reads the same on a
  // 60Hz laptop and a 120Hz one
  const ks = 1 - Math.pow(0.92, dt * 60);
  cam.x += (cam.tx - cam.x) * ks;
  cam.y += (cam.ty - cam.y) * ks;
  cam.z += (cam.tz - cam.z) * ks;
  camera.position.set(cam.x, cam.y, cam.z);
  camera.lookAt(cam.x + ndc.x * 0.5, cam.y + ndc.y * 0.35, 0);
  // cards
  for (const g of cards) {
    const u = g.userData;
    const kc = 1 - Math.pow(0.88, dt * 60);
    u.lift += (u.tLift - u.lift) * kc;
    u.sc += (u.tSc - u.sc) * kc;
    g.position.z = u.baseZ + u.lift;
    g.scale.setScalar(u.sc);
    const sway =
      REDUCED || u.mural
        ? 0
        : Math.sin(t * 0.55 + u.phase) * 0.006 +
          u.lift * 0.02 * Math.sin(t * 2.2 + u.phase);
    g.rotation.z = u.baseRot + sway;
    g.rotation.x =
      REDUCED || u.mural
        ? 0
        : Math.sin(t * 0.4 + u.phase) * 0.004 + u.lift * 0.06;
    // Colour follows the stop, both kinds the same way round: what
    // the deck is on comes up to full strength and everything else
    // holds back a shade. Paper carries it in its own colour; the
    // wall's writing, which cannot move, deepens into the plaster.
    u.glow += (u.tGlow - u.glow) * kc;
    if (u.mural)
      u.paper.material.color.setScalar(
        MURAL_REST - u.glow * (MURAL_REST - 1 + u.glowK),
      );
    else
      u.paper.material.color.setScalar(
        PAPER_REST + (1 - PAPER_REST) * (u.lift / STORY_LIFT),
      );
  }
  // dust drift
  const pos = dust.geometry.attributes.position;
  if (pos) {
    for (let i = 0; i < dustN; i++) {
      const drift = dv[i];
      if (!drift) continue;
      let x = pos.getX(i) + drift[0] * dt * 8,
        y = pos.getY(i) + drift[1] * dt * 8 + Math.sin(t + i) * 0.001;
      if (x > 27) x = -27;
      if (x < -27) x = 27;
      if (y > 15) y = -15;
      if (y < -15) y = 15;
      pos.setX(i, x);
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
  renderer.render(scene, camera);
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  storyReframe();
});

