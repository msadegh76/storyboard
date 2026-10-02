/* A slide, written down the way an author would have written it.

   The panel edits cards as data. The deck file holds them as source.
   This is the one place that turns the first into the second, so the
   file editor, an export, and a test all print the same text — and it
   is pure on purpose: no DOM, nothing from the scene, so it runs
   wherever a deck needs writing down, a Node script included.

   What is printed is what it is given, key for key, in the order the
   keys were put in. Deciding *which* keys a card should carry — leaving
   out a default, or a position the layout worked out for itself — is
   the editor's job, not this file's. */

import type { Card, Slide } from "./types.js";

const q = (s: string) => JSON.stringify(s);

type Bag = Record<string, unknown>;

function printValue(key: string, v: unknown, indent: string): string {
  if (typeof v === "string") return q(v);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number")
    // a pin's metal reads as a colour, so it is written as one
    return key === "pinColor" ? `0x${v.toString(16).padStart(6, "0")}` : String(v);
  if (Array.isArray(v))
    return `[\n${v.map((b) => `${indent}    ${q(String(b))},`).join("\n")}\n${indent}  ]`;
  return JSON.stringify(v);
}

/** One card, at a given indent. */
export function printCard(card: Card, indent = ""): string {
  if (typeof card === "string") return q(card);
  const rows: string[] = [];
  for (const [k, v] of Object.entries(card as Bag)) {
    if (v === undefined) continue;
    rows.push(`${indent}  ${k}: ${printValue(k, v, indent)},`);
  }
  return `{\n${rows.join("\n")}\n${indent}}`;
}

/** A slide, ready to drop into `slides`. One card is written straight
    in; several are held together, which is what `notes` is. */
export function printSlide(slide: Slide): string {
  const box = slide as { notes?: Card[]; cards?: Card[] };
  const list = Array.isArray(box.notes)
    ? box.notes
    : Array.isArray(box.cards)
      ? box.cards
      : null;
  if (!list) return printCard(slide as Card, "");
  const only = list[0];
  if (list.length === 1 && only !== undefined) return printCard(only, "");
  return `{\n  notes: [\n${list.map((c) => `    ${printCard(c, "    ")}`).join(",\n")},\n  ],\n}`;
}
