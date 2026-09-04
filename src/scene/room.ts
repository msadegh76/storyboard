/* The room the wall stands in: plaster, floorboards, skirting, the
   baked contact shading where they meet, and the dust in the air. */

import { THREE } from "../vendor.js";
import { ROOM_W, WALL_W, WALL_H, FLOOR_Y, WALL_TOP } from "../config.js";
import { rnd } from "../util.js";
import { makeWallTexture, makeWoodTexture } from "../textures/surfaces.js";
import { ctx2d } from "../textures/draw.js";
import { scene } from "./stage.js";

// Wall — a real architectural wall, not a framed board.
// It extends far past every camera position so you never see an edge,
// and meets a wooden floor at the bottom like an actual room.
const wallTx = makeWallTexture();
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
    bumpScale: 0.4,
    roughness: 0.96,
    metalness: 0,
  }),
);
wall.position.y = (WALL_TOP + FLOOR_Y) / 2;
wall.receiveShadow = true;
scene.add(wall);
scene.fog = new THREE.Fog(0xd7cdb9, 70, 160);

// Wooden floor meeting the wall
const woodTex = makeWoodTexture();
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
woodTex.repeat.set(9, 4);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, 110),
  new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0xa8825c,
    roughness: 0.62,
    metalness: 0.06,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, FLOOR_Y, 55);
floor.receiveShadow = true;
scene.add(floor);

// Skirting board along the wall/floor junction
const skirtMat = new THREE.MeshStandardMaterial({
  color: 0xe9e1cf,
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
scene.add(skirt);
const skirtCap = new THREE.Mesh(
  new THREE.BoxGeometry(ROOM_W, 0.22, 0.72),
  skirtMat,
);
skirtCap.position.set(0, FLOOR_Y + 1.55, 0.3);
skirtCap.castShadow = true;
scene.add(skirtCap);

// Soft contact shading where surfaces meet (baked AO gradients)
function gradTex(vertical: boolean) {
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
  gr.addColorStop(0, "rgba(40,30,18,.34)");
  gr.addColorStop(1, "rgba(40,30,18,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}
const aoWall = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, 4.5),
  new THREE.MeshBasicMaterial({
    map: gradTex(true),
    transparent: true,
    depthWrite: false,
  }),
);
aoWall.position.set(0, FLOOR_Y + 2.25 + 1.6, 0.05);
scene.add(aoWall);
const aoFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, 5),
  new THREE.MeshBasicMaterial({
    map: gradTex(true),
    transparent: true,
    depthWrite: false,
  }),
);
aoFloor.rotation.x = -Math.PI / 2;
aoFloor.position.set(0, FLOOR_Y + 0.02, 2.5 + 0.55);
scene.add(aoFloor);
// faint upper falloff so the wall darkens gently toward the ceiling
const aoTop = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, 26),
  new THREE.MeshBasicMaterial({
    map: gradTex(false),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }),
);
aoTop.position.set(0, WALL_TOP - 13, 0.05);
scene.add(aoTop);

// Ambient dust
const dustGeo = new THREE.BufferGeometry();
export const dustN = 110;
const dp = new Float32Array(dustN * 3);
/** Each mote's own drift, so no two cross the room together. */
export const dv: [number, number][] = [];
for (let i = 0; i < dustN; i++) {
  dp[i * 3] = rnd(-26, 26);
  dp[i * 3 + 1] = rnd(-14, 14);
  dp[i * 3 + 2] = rnd(1, 9);
  dv.push([rnd(-0.05, 0.05), rnd(-0.03, 0.03)]);
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
export const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    color: 0xfff3dd,
    size: 0.07,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }),
);
scene.add(dust);

