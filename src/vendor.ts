/* The 3D engine and the tween library, behind one seam.

   Every module reaches them through here rather than importing them
   directly, so the day this project moves to a different three.js — or
   drops GSAP for its own tweening — is a change to this file and to
   nothing else in the tree.

   Both are real dependencies, bundled into the build: the wall opens
   with no network. */

import * as THREE from "three";
import { gsap } from "gsap";

export { THREE, gsap };
