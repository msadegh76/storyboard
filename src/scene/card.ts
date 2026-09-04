/* Turning one authored promise into a group on the wall: its paper,
   the curl in that paper, and whatever holds it up. */

import { THREE } from "../vendor.js";
import { rnd } from "../util.js";
import { makePaperTexture } from "../textures/paper.js";
import { makeMuralTexture } from "../textures/mural.js";
import { makePhotoTexture } from "../textures/photo.js";
import { makeTapeTexture } from "../textures/surfaces.js";
import { scene } from "./stage.js";
import { imageFor } from "../deck/images.js";
import type { Promise_ } from "../deck/types.js";

/** What the wall keeps on each card, and what the loop animates. */
export interface CardUserData {
  /** The card as authored, after the schema filled it in. */
  p: Promise_;
  /** The sheet itself, so its colour can be moved. */
  paper: import("three").Mesh<
    import("three").BufferGeometry,
    import("three").MeshStandardMaterial
  >;
  /** Painted on the plaster rather than pinned to it. */
  mural: boolean;
  /** How far a stop deepens the writing: ink has more to give. */
  glowK: number;
  w: number;
  h: number;
  baseZ: number;
  /** Where it is now, and where the stop is asking it to be. */
  glow: number;
  tGlow: number;
  lift: number;
  tLift: number;
  sc: number;
  tSc: number;
  baseRot: number;
  /** Its own offset in the sway, so no two cards move together. */
  phase: number;
  pinHead?: import("three").Mesh;
}

/** A card on the wall: a group, with the wall's own bookkeeping on it. */
export type CardGroup = import("three").Group & { userData: CardUserData };

export const cards: CardGroup[] = [];

const pinGeoHead = new THREE.SphereGeometry(0.17, 20, 16);
const pinGeoShaft = new THREE.CylinderGeometry(0.028, 0.028, 0.4, 10);
export function bendGeometry(
  geo: import("three").PlaneGeometry,
  w: number,
  h: number,
) {
  const pos = geo.attributes.position;
  if (!pos) return; // a plane with no vertices has nothing to curl
  const amp = rnd(0.05, 0.12),
    ph = rnd(0, 6.28);
  const cx = ((Math.random() < 0.5 ? -1 : 1) * w) / 2,
    cy = h / 2,
    curl = rnd(0.1, 0.26),
    cr = rnd(1.1, 2) * (w * 0.4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i);
    let z = amp * Math.sin((x / w) * Math.PI + ph) * 0.6;
    const d = Math.hypot(x - cx, y - cy);
    z += curl * Math.exp(-(d * d) / cr);
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
}

export function makeAttach(
  p: Promise_,
  h: number,
  group: import("three").Group,
) {
  if (p.attach === "tape") {
    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.62),
      new THREE.MeshStandardMaterial({
        map: makeTapeTexture(),
        transparent: true,
        opacity: 0.9,
        roughness: 0.8,
        depthWrite: false,
      }),
    );
      tape.position.set(rnd(-0.3, 0.3), h / 2 - 0.05, 0.1);
    tape.rotation.z = rnd(-0.12, 0.12);
    tape.renderOrder = 2;
    group.add(tape);
  } else if (p.attach === "clip") {
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2c2c30,
      roughness: 0.4,
      metalness: 0.6,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.45, 0.22),
      dark,
    );
    body.position.set(0, h / 2 + 0.1, 0.14);
    body.castShadow = true;
    group.add(body);
    const armMat = new THREE.MeshStandardMaterial({
      color: 0xb9b9c0,
      roughness: 0.3,
      metalness: 0.85,
    });
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8),
        armMat,
      );
      arm.position.set(s * 0.28, h / 2 + 0.45, 0.16);
      arm.rotation.z = s * 0.5;
      group.add(arm);
    }
  } else {
    const metal = new THREE.MeshStandardMaterial({
      color: p.pinColor || 0x9a7b3f,
      roughness: 0.28,
      metalness: 0.85,
    });
    const head = new THREE.Mesh(pinGeoHead, metal);
    head.castShadow = true;
    head.position.set(rnd(-0.4, 0.4), h / 2 - 0.35, 0.3);
    head.scale.z = 0.75;
    const shaft = new THREE.Mesh(
      pinGeoShaft,
      new THREE.MeshStandardMaterial({
        color: 0x777779,
        roughness: 0.35,
        metalness: 0.9,
      }),
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(head.position.x, head.position.y, 0.12);
    group.add(shaft);
    group.add(head);
    group.userData.pinHead = head;
  }
}

export function buildCard(p: Promise_): CardGroup {
  if (p.image) p.userImage = imageFor(p.image);
  // writing on the wall itself: no paper, no fixing, no shadow
  const mural = p.type === "mural";
  // a capture that never arrived leaves a readable note in its place
  const photo = p.type === "photo" && (p.userImage || !p.image);
  const { tex, ratio } = mural
    ? makeMuralTexture(p)
    : photo
      ? makePhotoTexture(p)
      : makePaperTexture(p);
  const w = p.w,
    h = w * ratio;
  const seg = mural ? 1 : 12;
  const geo = new THREE.PlaneGeometry(w, h, seg, seg);
  if (!mural) bendGeometry(geo, w, h); // paint has nothing to curl
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    // paper is cut out at a hard edge; paint fades into the plaster
    transparent: mural,
    depthWrite: !mural,
    alphaTest: mural ? 0 : 0.5,
    roughness: mural ? 0.99 : 0.93,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // a screenshot's texture is deliberately larger than the card ever
  // gets on screen, and that is exactly what makes the GPU reach for
  // the half-size mipmap and blur the UI text away. pulling the level
  // of detail down by one puts us back on mip 0 at reading distance,
  // while the chain still exists to keep the board view from crawling
  if (photo && p.userImage) {
    mat.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
           vec4 texelColor = texture2D( map, vMapUv, -1.0 );
           diffuseColor *= texelColor;
         #endif`,
      );
    };
  }
  const paper = new THREE.Mesh(geo, mat);
  paper.castShadow = !mural; // paint stands off nothing: no shadow
  paper.receiveShadow = true;
  if (mural) paper.renderOrder = 1;
  else
    paper.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: tex,
      alphaTest: 0.5,
    });
  const group = new THREE.Group() as CardGroup;
  group.add(paper);
  if (!mural) makeAttach(p, h, group);
  // paint sits in the plaster; paper lies on top of it
  const baseZ = mural ? 0.04 : 0.18 + rnd(0, 0.1);
  group.position.set(p.x ?? 0, p.y ?? 0, baseZ);
  group.rotation.z = (p.rot * Math.PI) / 180;
  Object.assign(group.userData, {
    p,
    paper,
    mural,
    // how far a stop deepens the writing: ink has more to give
    glowK: p.ink ? 0.34 : 0.22,
    w,
    h,
    baseZ,
    glow: 0,
    tGlow: 0,
    lift: 0,
    tLift: 0,
    sc: 1,
    tSc: 1,
    baseRot: (p.rot * Math.PI) / 180,
    phase: rnd(0, 6.28),
  });
  paper.userData.group = group;
  scene.add(group);
  cards.push(group);
  return group;
}


/* ------------------------------------------------------------------
   Drawing one card again
------------------------------------------------------------------ */

/* Everything a card allocated on the GPU, given back.

   Two of the geometries here are shared by every pin on the wall, so
   they are stepped over: disposing one card's pin head would empty the
   buffer that all the others are still drawing from. Everything else —
   the bent plane, the paper texture, the depth material that carries a
   second reference to it — belongs to this card alone. */
function disposeCard(g: CardGroup) {
  scene.remove(g);
  g.traverse((o) => {
    const m = o as import("three").Mesh;
    if (!(m as { isMesh?: boolean }).isMesh) return;
    if (m.geometry !== pinGeoHead && m.geometry !== pinGeoShaft)
      m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const std = mat as import("three").MeshStandardMaterial;
      std?.map?.dispose();
      std?.dispose();
    }
    const depth = m.customDepthMaterial as
      | import("three").MeshDepthMaterial
      | undefined;
    depth?.dispose();
  });
}

/**
 * Draw a card again after its promise was edited, in place.
 *
 * The wall keeps its own position for a card once the separation pass
 * has run, and that is not written back to `x`/`y` — so a plain rebuild
 * would snap the card to where the layout first put it. The spot is
 * carried across instead, along with the sway offset and the depth it
 * was resting at, so a card being typed into stays exactly where it is
 * and only its face changes. A card that has just become a mural is the
 * one exception: paint sits at a different depth to paper.
 *
 * @param p the promise, already mutated
 * @returns the new group, or undefined if that promise is not on the wall
 */
export function rebuildCard(p: Promise_): CardGroup | undefined {
  const at = cards.findIndex((c) => c.userData.p === p);
  const old = cards[at];
  if (!old) return undefined;

  const spot = old.position.clone();
  const {
    baseZ,
    phase,
    mural: wasMural,
    /* Where the card had settled to. A fresh card starts flat on the
       wall and unlit, so without carrying these across, a card that the
       stop had already lifted would drop and climb again on every
       keystroke — the wall twitching under whoever is writing on it. */
    lift,
    tLift,
    glow,
    tGlow,
    sc,
    tSc,
  } = old.userData;
  disposeCard(old);
  cards.splice(at, 1);

  const g = buildCard(p);
  // buildCard appends; the deck reads in order, so put it back
  cards.pop();
  cards.splice(at, 0, g);

  g.position.x = spot.x;
  g.position.y = spot.y;
  if (g.userData.mural === wasMural) {
    g.position.z = spot.z;
    g.userData.baseZ = baseZ;
  }
  Object.assign(g.userData, { phase, lift, tLift, glow, tGlow, sc, tSc });
  return g;
}
