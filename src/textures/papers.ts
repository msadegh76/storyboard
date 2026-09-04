/* The paper stocks a note can be printed on. `swatch` is CSS, kept
   here so a picker UI can show the stock without a render. */

/** One stock: what it is made of, and how it takes ink. */
export interface Paper {
  /** What to call it in a picker. */
  label: string;
  /** The sheet itself. */
  base: string;
  /** What is written on it. */
  ink: string;
  /** A torn stock is cut to a ragged silhouette rather than a rectangle. */
  torn: boolean;
  /** Ruling printed onto the sheet before anything is written. */
  lines: "none" | "ruled" | "grid";
  /** How much speckle sits in the fibre, 0 to 1. */
  grain: number;
  /** A CSS background that stands in for the stock outside the scene. */
  swatch: string;
  /** A ring binding down the left edge. */
  spiral?: boolean;
  /** A deckle edge: torn, but coarser. */
  rough?: boolean;
}

const STOCKS = {
  classic: {
    label: "Classic",
    base: "#f4eddc",
    ink: "#4a4234",
    torn: true,
    lines: "none",
    grain: 0.1,
    swatch: "background:#f4eddc",
  },
  notebook: {
    label: "Notebook",
    base: "#f7f3e8",
    ink: "#44507a",
    torn: false,
    lines: "ruled",
    spiral: true,
    grain: 0.06,
    swatch:
      "background:repeating-linear-gradient(#f7f3e8,#f7f3e8 9px,#cdd6e6 9px,#cdd6e6 10px)",
  },
  graph: {
    label: "Graph",
    base: "#f6f4ec",
    ink: "#3f4a41",
    torn: false,
    lines: "grid",
    grain: 0.05,
    swatch:
      "background:#f6f4ec;background-image:linear-gradient(#dfe4d8 1px,transparent 1px),linear-gradient(90deg,#dfe4d8 1px,transparent 1px);background-size:9px 9px",
  },
  pastelPink: {
    label: "Blush",
    base: "#ecd3cd",
    ink: "#5c4038",
    torn: true,
    lines: "none",
    grain: 0.09,
    swatch: "background:#ecd3cd",
  },
  pastelPurple: {
    label: "Lilac",
    base: "#cfc6e0",
    ink: "#453d5c",
    torn: false,
    lines: "none",
    grain: 0.08,
    swatch: "background:#cfc6e0",
  },
  pastelGreen: {
    label: "Sage",
    base: "#cfd3bd",
    ink: "#3f4632",
    torn: false,
    lines: "none",
    grain: 0.09,
    swatch: "background:#cfd3bd",
  },
  kraft: {
    label: "Kraft",
    base: "#c9a878",
    ink: "#46351f",
    torn: true,
    lines: "none",
    grain: 0.16,
    swatch: "background:#c9a878",
  },
  torn: {
    label: "Handmade",
    base: "#efe9dd",
    ink: "#443d31",
    torn: true,
    lines: "none",
    grain: 0.13,
    rough: true,
    swatch:
      "background:#efe9dd;box-shadow:inset 0 0 0 3px #fff, 0 2px 6px rgba(80,60,35,.18)",
  },
} satisfies Record<string, Paper>;

/** The name of a stock — the keys of PAPERS, and nothing else. */
export type PaperName = keyof typeof STOCKS;

export const PAPERS: Record<PaperName, Paper> = STOCKS;
