/* The room the wall stands in: plaster, floor, skirting, the baked
   contact shading where they meet, and the dust in the air.

   Built once the deck has been read, because the deck says which room
   it hangs in — see rooms.ts — and everything here takes its colours
   from that. Before `buildRoom` runs there is no wall to see. */

import { THREE } from "../vendor.js";
import { ROOM_W, WALL_W, WALL_H, FLOOR_Y, WALL_TOP } from "../config.js";
import { rnd } from "../util.js";
import { makeWallTexture, makeFloorTexture } from "../textures/surfaces.js";
import { ctx2d } from "../textures/draw.js";
import { scene } from "./stage.js";
import type { Room } from "../rooms.js";

// Soft contact shading where surfaces meet (baked AO gradients)
function gradTex(vertical: boolean, rgb: string) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = ctx2d(c),
    gr = g.createLinearGradient(
      0,
      vertical ? 128 : 0,
      0,
      vertical ? 0 : 128,
    );
  gr.addColorStop(0, `rgba(${rgb},.34)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

/** The motes in the air. Filled by `buildRoom`; drifted by the loop. */
export const dustN = 110;
/** Each mote's own drift, so no two cross the room together. */
export const dv: [number, number][] = [];
export let dust: THREE.Points;

/* Everything the last `buildRoom` put in the scene, so that building
   another room — the editor letting an author try one — takes the old
   one down first, textures and all, rather than stacking walls. */
let built: THREE.Object3D[] = [];
function takeDown() {
  for (const o of built) {
    scene.remove(o);
    o.traverse((n) => {
      const m = n as THREE.Mesh;
      if (!(m as { isMesh?: boolean }).isMesh && !(m as { isPoints?: boolean }).isPoints) return;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        std?.map?.dispose();
        std?.bumpMap?.dispose();
        std?.dispose();
      }
    });
  }
  built = [];
}

/**
 * Put the room up around the wall's origin, coloured for `room`.
 *
 * The wall is a real architectural wall, not a framed board: it extends
 * far past every camera position so you never see an edge, and meets
 * the floor at the bottom like an actual room. Called again with
 * another room, it replaces itself.
 */
export function buildRoom(room: Room) {
  takeDown();
  const add = (o: THREE.Object3D) => {
    scene.add(o);
    built.push(o);
  };
  const wallTx = makeWallTexture(room.plaster);
  const ROOM_H = WALL_TOP - FLOOR_Y;
  [wallTx.tex, wallTx.bump].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ROOM_W / WALL_W, ROOM_H / WALL_H);
  });
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_H),
    new THREE.MeshStandardMaterial({
      map: wallTx.tex,
      bumpMap: wallTx.bump,
      bumpScale: room.plaster.bump,
      roughness: 0.96,
      metalness: 0,
    }),
  );
  wall.position.y = (WALL_TOP + FLOOR_Y) / 2;
  wall.receiveShadow = true;
  add(wall);
  scene.fog = new THREE.Fog(room.fog, 70, 160);

  // The floor meeting the wall
  const floorTex = makeFloorTexture(room.floor);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(9, 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, 110),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      color: room.floor.tint,
      roughness: room.floor.kind === "concrete" ? 0.8 : 0.62,
      metalness: room.floor.kind === "concrete" ? 0.02 : 0.06,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, 55);
  floor.receiveShadow = true;
  add(floor);

  // Skirting board along the wall/floor junction
  const skirtMat = new THREE.MeshStandardMaterial({
    color: room.skirting,
    roughness: 0.55,
    metalness: 0.02,
  });
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_W, 1.5, 0.55),
    skirtMat,
  );
  skirt.position.set(0, FLOOR_Y + 0.75, 0.28);
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  add(skirt);
  const skirtCap = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_W, 0.22, 0.72),
    skirtMat,
  );
  skirtCap.position.set(0, FLOOR_Y + 1.55, 0.3);
  skirtCap.castShadow = true;
  add(skirtCap);

  const aoWall = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, 4.5),
    new THREE.MeshBasicMaterial({
      map: gradTex(true, room.contact),
      transparent: true,
      depthWrite: false,
    }),
  );
  aoWall.position.set(0, FLOOR_Y + 2.25 + 1.6, 0.05);
  add(aoWall);
  const aoFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, 5),
    new THREE.MeshBasicMaterial({
      map: gradTex(true, room.contact),
      transparent: true,
      depthWrite: false,
    }),
  );
  aoFloor.rotation.x = -Math.PI / 2;
  aoFloor.position.set(0, FLOOR_Y + 0.02, 2.5 + 0.55);
  add(aoFloor);
  // faint upper falloff so the wall darkens gently toward the ceiling
  const aoTop = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, 26),
    new THREE.MeshBasicMaterial({
      map: gradTex(false, room.contact),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  aoTop.position.set(0, WALL_TOP - 13, 0.05);
  add(aoTop);

  // Ambient dust
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(dustN * 3);
  dv.length = 0;
  for (let i = 0; i < dustN; i++) {
    dp[i * 3] = rnd(-26, 26);
    dp[i * 3 + 1] = rnd(-14, 14);
    dp[i * 3 + 2] = rnd(1, 9);
    dv.push([rnd(-0.05, 0.05), rnd(-0.03, 0.03)]);
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: room.dust.color,
      size: 0.07,
      transparent: true,
      opacity: room.dust.opacity,
      depthWrite: false,
    }),
  );
  add(dust);
}
