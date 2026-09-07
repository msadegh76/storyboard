/* Editing a deck file as text, without disturbing the rest of it.
 *
 * The editor hands back one slide, written out. Putting that slide into
 * the file means finding exactly where the old one starts and ends —
 * and nothing more, because everything around it is somebody's writing:
 * the comments that explain what a stock is, the blank lines that group
 * the deck into chapters, the order they chose.
 *
 * So this does not parse the file into an object and print it back.
 * That would return a correct deck and lose the document. It finds the
 * span of one array element and swaps the characters.
 *
 * The one thing it cannot preserve is a comment written *inside* the
 * slide being replaced — that slide is being rewritten from what the
 * wall now holds, and the wall does not hold comments. Comments before
 * it, after it, and in every other slide survive untouched.
 */

/** Characters that open something we have to see the end of. */
const OPEN = { "{": "}", "[": "]", "(": ")" };

/* Walk the source from `i`, stepping over anything that is not
   structure: strings of all three kinds, and both sorts of comment. A
   brace inside a string is not a brace. Returns where the trivia ends,
   or i if there was none. */
function skipTrivia(src, i, stopAtNewlineComment = false) {
  for (;;) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      if (stopAtNewlineComment) return i;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    return i;
  }
}

/* Step over one string literal beginning at `i`, backslash escapes and
   all. A template literal may hold `${ ... }` with anything inside, so
   its interpolations are walked as source rather than as text. */
function skipString(src, i) {
  const quote = src[i++];
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (quote === "`" && c === "$" && src[i + 1] === "{") {
      i = matchBracket(src, i + 1) + 1;
      continue;
    }
    if (c === quote) return i + 1;
    i++;
  }
  throw new Error("deck source: a string literal is never closed");
}

/** The index of the bracket closing the one at `open`. */
function matchBracket(src, open) {
  const want = OPEN[src[open]];
  if (!want) throw new Error(`deck source: ${src[open]} is not a bracket`);
  const stack = [want];
  let i = open + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = skipTrivia(src, i);
      continue;
    }
    if (OPEN[c]) {
      stack.push(OPEN[c]);
      i++;
      continue;
    }
    if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
      i++;
      continue;
    }
    i++;
  }
  throw new Error("deck source: a bracket is never closed");
}

/* Every `slides: [` that is code — the index of each opening bracket.
   Walked rather than matched with a regex, because the words `slides:`
   are exactly what a comment explaining a deck file says, and a comment
   is not a deck. */
function slidesArrays(src) {
  const hits = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = skipTrivia(src, i);
      continue;
    }
    if (c === "s" && !/[\w$]/.test(src[i - 1] ?? "")) {
      const m = /^slides\s*:\s*\[/.exec(src.slice(i, i + 40));
      if (m) {
        hits.push(i + m[0].length - 1);
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return hits;
}

/** Whether this file holds a deck of its own, rather than pointing at one. */
export const hasSlides = (src) => slidesArrays(src).length > 0;

/**
 * Where each slide sits in the file.
 *
 * @param {string} src the deck file
 * @returns {{ open: number, close: number, spans: {start:number,end:number}[] }}
 *   the array's own brackets, and the span of each element's value —
 *   tight around the value itself, so the comments and blank lines
 *   between slides fall outside every span.
 */
export function slideSpans(src) {
  const hits = slidesArrays(src);
  if (hits.length !== 1)
    throw new Error(
      `deck source: expected exactly one \`slides:\` array, found ${hits.length}`,
    );
  const open = hits[0];
  const close = matchBracket(src, open);

  const spans = [];
  let i = open + 1;
  while (i < close) {
    i = skipTrivia(src, i);
    if (i >= close) break;
    if (src[i] === ",") {
      i++;
      continue;
    }
    const start = i;
    let end;
    if (OPEN[src[i]]) {
      end = matchBracket(src, i) + 1;
    } else {
      // a bare string is a card too: `"Just some words"`
      if (src[i] === '"' || src[i] === "'" || src[i] === "`")
        end = skipString(src, i);
      else {
        let j = i;
        while (j < close && src[j] !== ",") j++;
        end = j;
      }
    }
    spans.push({ start, end });
    i = end;
  }
  return { open, close, spans };
}

/** The whitespace at the start of the line `at` falls on. */
function indentAt(src, at) {
  const lineStart = src.lastIndexOf("\n", at - 1) + 1;
  const run = /^[ \t]*/.exec(src.slice(lineStart, at));
  return run ? run[0] : "";
}

/* Written flush left by the editor, laid in at the depth the file
   already uses. The first line is not touched — it starts where the old
   slide started. */
function reindent(block, indent) {
  return block
    .split("\n")
    .map((line, i) => (i === 0 || !line ? line : indent + line))
    .join("\n");
}

/**
 * Replace one slide, leaving every character around it alone.
 *
 * @param {string} src the deck file
 * @param {number} index which slide, counting from zero
 * @param {string} block the slide, written out flush left
 * @returns {string} the file, with that slide swapped
 */
export function replaceSlide(src, index, block) {
  const { spans } = slideSpans(src);
  const span = spans[index];
  if (!span)
    throw new Error(
      `deck source: this deck has ${spans.length} slides, so there is no slide ${index + 1}`,
    );
  return (
    src.slice(0, span.start) +
    reindent(block, indentAt(src, span.start)) +
    src.slice(span.end)
  );
}

/**
 * Put a new slide after an existing one — or first, when `after` is
 * negative or the array is empty. The comma and the newline are written
 * to match what the file already does between slides.
 *
 * @param {string} src the deck file
 * @param {number} after the slide to follow, counting from zero; -1 for first
 * @param {string} block the new slide, written out flush left
 */
export function insertSlide(src, after, block) {
  const { open, close, spans } = slideSpans(src);
  if (!spans.length) {
    // whatever whitespace the empty array held is replaced, so `[]`
    // and `[\n  ]` both come out as one slide laid in cleanly
    const outer = indentAt(src, open);
    const indent = outer + "  ";
    return (
      src.slice(0, open + 1) +
      `\n${indent}${reindent(block, indent)},\n${outer}` +
      src.slice(close)
    );
  }
  /* The file's own rhythm. If a blank line parts a slide from its
     neighbour, the new one is parted the same way — so a slide put
     back where it was leaves the file exactly as it found it. Read
     off the pair the new slide lands beside; at either end of the
     deck, off the nearest pair there is. */
  const afterComma = (i) => {
    const span = spans[i];
    let cut = span.end;
    const next = skipTrivia(src, cut, true);
    if (src[next] === ",") cut = next + 1;
    return cut;
  };
  const parted = (i) =>
    i >= 0 &&
    i + 1 < spans.length &&
    /^[ \t]*\n[ \t]*\n/.test(src.slice(afterComma(i), spans[i + 1].start));

  if (after < 0) {
    // at the front: before the first slide, at its depth
    const first = spans[0];
    const indent = indentAt(src, first.start);
    const gap = parted(0) ? "\n" : "";
    return (
      src.slice(0, open + 1) +
      `\n${indent}${reindent(block, indent)},${gap}` +
      src.slice(open + 1)
    );
  }
  const at = Math.min(after, spans.length - 1);
  const span = spans[at];
  const indent = indentAt(src, span.start);
  // step past the comma the file already has after that slide, if any
  const cut = afterComma(at);
  const gap = (at + 1 < spans.length ? parted(at) : parted(at - 1)) ? "\n" : "";
  return (
    src.slice(0, cut) +
    `${gap}\n${indent}${reindent(block, indent)},` +
    src.slice(cut)
  );
}

/* A slide's text as it sits in the file carries the file's indentation
   on every line but its first. Taken off, the text can be laid back in
   at whatever depth it lands at. */
function dedent(block) {
  const lines = block.split("\n");
  const pad = Math.min(
    Infinity,
    ...lines
      .slice(1)
      .filter((l) => l.trim())
      .map((l) => /^[ \t]*/.exec(l)[0].length),
  );
  return lines
    .map((l, i) => (i === 0 || !l.trim() ? l : l.slice(pad)))
    .join("\n");
}

/**
 * Move a slide to another place in the deck. The comments between
 * slides stay where they were; a slide carries its own text and
 * nothing else.
 *
 * @param {string} src the deck file
 * @param {number} from which slide, counting from zero
 * @param {number} to where it ends up, counting from zero
 */
export function moveSlide(src, from, to) {
  const { spans } = slideSpans(src);
  const span = spans[from];
  if (!span) throw new Error(`deck source: there is no slide ${from + 1}`);
  to = Math.min(Math.max(to, 0), spans.length - 1);
  if (to === from) return src;
  const block = slideText(src, from); // with the comment above it
  // once it is out, "at index `to`" is "after the slide before that"
  return insertSlide(removeSlide(src, from), to - 1, block);
}

/* Where a slide really begins: a comment written directly above it,
   with nothing but whitespace between, is about that slide, and goes
   where it goes. Any number of them, block or line, up to the comma of
   the slide before (or the array's own bracket). */
function withComment(src, open, spans, index) {
  const span = spans[index];
  let floor = open + 1;
  if (index > 0) {
    const comma = src.indexOf(",", spans[index - 1].end);
    floor = comma < 0 ? spans[index - 1].end : comma + 1;
  }
  let start = span.start;
  for (;;) {
    let i = start;
    while (i > floor && /\s/.test(src[i - 1])) i--;
    if (i <= floor) break;
    if (src.slice(i - 2, i) === "*/") {
      const at = src.lastIndexOf("/*", i - 2);
      if (at < floor) break;
      start = at;
      continue;
    }
    const ls = src.lastIndexOf("\n", i - 1) + 1;
    const line = src.slice(Math.max(ls, floor), i);
    const m = /^(\s*)\/\//.exec(line);
    if (m) {
      start = Math.max(ls, floor) + m[1].length;
      continue;
    }
    break;
  }
  return start;
}

/**
 * The text a slide would take with it: the slide, and the comment
 * written directly above it, laid flush left. What `removeSlide` takes
 * out, so that an undo can put back exactly that.
 *
 * @param {string} src the deck file
 * @param {number} index which slide, counting from zero
 */
export function slideText(src, index) {
  const { open, spans } = slideSpans(src);
  const span = spans[index];
  if (!span) throw new Error(`deck source: there is no slide ${index + 1}`);
  return dedent(src.slice(withComment(src, open, spans, index), span.end));
}

/**
 * Take a slide out. The comma that held it in place goes with it.
 *
 * @param {string} src the deck file
 * @param {number} index which slide, counting from zero
 */
export function removeSlide(src, index) {
  const { open, spans } = slideSpans(src);
  const span = spans[index];
  if (!span) throw new Error(`deck source: there is no slide ${index + 1}`);
  let end = span.end;
  const next = skipTrivia(src, end, true);
  if (src[next] === ",") end = next + 1;
  // and the line it was sitting on, so no blank gap is left behind —
  // along with the comment written above it, which was about it
  let start = withComment(src, open, spans, index);
  const lineStart = src.lastIndexOf("\n", start - 1) + 1;
  if (!src.slice(lineStart, start).trim()) start = lineStart;
  while (src[end] === " " || src[end] === "\t") end++;
  if (src[end] === "\n") end++;
  /* A slide parted from its neighbours by blank lines would leave two
     of them together, or one against the bracket. One goes with it. */
  const before = src.slice(0, start);
  const after = src.slice(end);
  const blankBefore = before.endsWith("\n\n");
  const blankAfter = after.startsWith("\n");
  if (blankAfter && (blankBefore || before.endsWith("[\n")))
    return before + after.slice(1);
  if (blankBefore && /^[ \t]*\]/.test(after)) return before.slice(0, -1) + after;
  return before + after;
}

/* ------------------------------------------------------------------
   The deck's own fields
------------------------------------------------------------------ */

/* The object the slides array belongs to — the deck itself. Found by
   walking from the top with the same eye for strings and comments, and
   remembering every bracket still open when `slides:` is reached: the
   innermost `{` among them is the deck. */
function deckObject(src) {
  const at = slidesArrays(src)[0];
  if (at == null) throw new Error("deck source: no slides array");
  const stack = [];
  let i = 0;
  while (i < at) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = skipTrivia(src, i);
      continue;
    }
    if (OPEN[c]) stack.push(i);
    else if (c === "}" || c === "]" || c === ")") stack.pop();
    i++;
  }
  for (let k = stack.length - 1; k >= 0; k--)
    if (src[stack[k]] === "{") return { open: stack[k], close: matchBracket(src, stack[k]) };
  throw new Error("deck source: no object holds the slides");
}

/* Step over one value at the deck's own depth: a string, a bracketed
   thing whole, or a bare word, up to the comma that ends it. */
function skipValue(src, i, close) {
  while (i < close) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = skipTrivia(src, i);
      continue;
    }
    if (OPEN[c]) {
      i = matchBracket(src, i) + 1;
      continue;
    }
    if (c === ",") return i;
    i++;
  }
  return close;
}

/** The deck's top-level fields: where each key starts, and its value. */
function deckFields(src) {
  const { open, close } = deckObject(src);
  const fields = [];
  let i = open + 1;
  while (i < close) {
    i = skipTrivia(src, i);
    if (i >= close) break;
    if (src[i] === ",") {
      i++;
      continue;
    }
    const m = /^([A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*:/.exec(src.slice(i, i + 200));
    if (!m) {
      i = skipValue(src, i, close);
      continue;
    }
    const key = m[1].replace(/^["']|["']$/g, "");
    const valueStart = skipTrivia(src, i + m[0].length);
    const valueEnd = skipValue(src, valueStart, close);
    fields.push({ key, start: i, valueStart, valueEnd });
    i = valueEnd;
  }
  return { open, fields };
}

/**
 * Set one of the deck's own fields — `room`, say — leaving everything
 * else as it was. A field that exists has its value swapped in place;
 * one that does not is written on its own line just above `slides`,
 * at that line's depth. `null` takes the field out, line and all.
 *
 * @param {string} src the deck file
 * @param {string} key the field
 * @param {string|null} value its value, as source — `"night"` with the quotes
 */
export function setDeckField(src, key, value) {
  const { open, fields } = deckFields(src);
  const f = fields.find((f) => f.key === key);
  if (f) {
    if (value != null) return src.slice(0, f.valueStart) + value + src.slice(f.valueEnd);
    let start = f.start;
    const ls = src.lastIndexOf("\n", start - 1) + 1;
    if (!src.slice(ls, start).trim()) start = ls;
    let end = f.valueEnd;
    if (src[end] === ",") end++;
    while (src[end] === " " || src[end] === "\t") end++;
    if (start === ls && src[end] === "\n") end++;
    return src.slice(0, start) + src.slice(end);
  }
  if (value == null) return src;
  const slides = fields.find((f) => f.key === "slides");
  if (!slides) return src.slice(0, open + 1) + `\n  ${key}: ${value},` + src.slice(open + 1);
  const ls = src.lastIndexOf("\n", slides.start - 1) + 1;
  const lead = src.slice(ls, slides.start);
  // `slides` sharing its line with something else: squeeze in before it
  if (lead.trim()) return src.slice(0, slides.start) + `${key}: ${value}, ` + src.slice(slides.start);
  return src.slice(0, ls) + `${lead}${key}: ${value},\n` + src.slice(ls);
}
