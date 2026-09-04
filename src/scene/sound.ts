/* A tiny synthesized tap when the deck moves. Nothing is loaded. */

import { REDUCED } from "../util.js";

let AC: AudioContext | null = null;
export function ensureAudio() {
  if (!AC) {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) AC = new Ctor();
    } catch (e) {}
  }
}
export function tap(freq: number, dur: number, gain: number) {
  if (!AC || REDUCED) return;
  const o = AC.createOscillator(),
    g = AC.createGain();
  o.frequency.value = freq;
  o.type = "triangle";
  g.gain.setValueAtTime(gain, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g).connect(AC.destination);
  o.start();
  o.stop(AC.currentTime + dur);
}

