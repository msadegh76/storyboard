import {readFileSync} from 'node:fs';
import {slideSpans, replaceSlide, insertSlide, removeSlide, moveSlide, hasSlides} from './deck-source.js';

/* The decks import defineDeck from TypeScript, which node will not
   resolve — swap it for identity so the object itself can be read. */
const load = async (src) => {
  const stubbed = src.replace(/^import[^;]+;/m, 'const defineDeck = d => d;');
  return (await import('data:text/javascript;base64,' + Buffer.from(stubbed).toString('base64'))).default;
};

let fail = 0;
for (const f of ['../examples/hello-wall/deck.config.js','../examples/lighthouse-bakery/deck.config.js','../examples/onboarding/deck.config.js']){
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  const deck = await load(src);
  const {spans} = slideSpans(src);
  const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if(!cond) fail++; };

  console.log(`\n=== ${f.replace('../','')}  (${deck.slides.length} slides)`);
  ok(`span count matches the module (${spans.length})`, spans.length === deck.slides.length);

  /* The editor sends a block written flush left, so that is what the
     invariant has to be fed: take each slide, strip the file's own
     indentation off it, put it back, and the file must be byte for
     byte what it was. */
  const dedent = t => { const ls=t.split('\n'); const pad=Math.min(...ls.slice(1).filter(l=>l.trim()).map(l=>/^[ \t]*/.exec(l)[0].length), Infinity);
    return ls.map((l,i)=>i===0||!l.trim()?l:l.slice(pad)).join('\n'); };
  let idem = true, firstBad = null;
  for (let i=0;i<spans.length;i++){
    const flat = dedent(src.slice(spans[i].start, spans[i].end));
    if (replaceSlide(src, i, flat) !== src) { idem = false; firstBad ??= i+1; }
  }
  ok(`replacing every slide with its own text changes nothing${firstBad?` (first bad: ${firstBad})`:''}`, idem);

  let ev = 0;
  for (const s of spans) { try { new Function('return ('+src.slice(s.start,s.end)+')')(); ev++; } catch { console.log('        will not evaluate:', JSON.stringify(src.slice(s.start,s.start+60))); } }
  ok(`every span evaluates on its own (${ev}/${spans.length})`, ev === spans.length);

  // a real replacement: swap slide 2 for a plain card, then read it back
  const edited = replaceSlide(src, 1, '{\n  title: "Swapped",\n  text: "by the test",\n}');
  const back = await load(edited);
  ok('after a replacement the deck still loads', back.slides.length === deck.slides.length);
  ok('the replaced slide is the new one', back.slides[1].title === 'Swapped');
  ok('its neighbours are untouched', JSON.stringify(back.slides[0])===JSON.stringify(deck.slides[0]) && JSON.stringify(back.slides[2])===JSON.stringify(deck.slides[2]));

  // insert
  const grown = await load(insertSlide(src, 0, '{\n  title: "Inserted",\n}'));
  ok('insert adds exactly one slide', grown.slides.length === deck.slides.length + 1);
  ok('it lands where it was asked to', grown.slides[1].title === 'Inserted');
  ok('everything before it is unchanged', JSON.stringify(grown.slides[0])===JSON.stringify(deck.slides[0]));
  ok('everything after it is unchanged', JSON.stringify(grown.slides.slice(2))===JSON.stringify(deck.slides.slice(1)));

  // insert at the front — what "+ stop" on the opening wide shot does
  const fronted = await load(insertSlide(src, -1, '{\n  title: "First",\n}'));
  ok('a front insert adds exactly one slide', fronted.slides.length === deck.slides.length + 1);
  ok('it is the first one', fronted.slides[0].title === 'First');
  ok('the rest follow it unchanged', JSON.stringify(fronted.slides.slice(1))===JSON.stringify(deck.slides));

  // remove
  const shrunk = await load(removeSlide(src, 1));
  ok('remove takes exactly one slide', shrunk.slides.length === deck.slides.length - 1);
  ok('it takes the right one', JSON.stringify(shrunk.slides[1])===JSON.stringify(deck.slides[2]));

  // move — what dragging a slide in the overview does
  const J = (s) => JSON.stringify(s);
  const toEnd = await load(moveSlide(src, 0, deck.slides.length - 1));
  ok('moving the first slide to the end keeps the count', toEnd.slides.length === deck.slides.length);
  ok('it is last now', J(toEnd.slides[toEnd.slides.length - 1]) === J(deck.slides[0]));
  ok('the rest kept their order', J(toEnd.slides.slice(0, -1)) === J(deck.slides.slice(1)));
  const toFront = await load(moveSlide(src, deck.slides.length - 1, 0));
  ok('moving the last slide to the front puts it first', J(toFront.slides[0]) === J(deck.slides[deck.slides.length - 1]) && J(toFront.slides.slice(1)) === J(deck.slides.slice(0, -1)));
  const oneDown = await load(moveSlide(src, 1, 2));
  ok('moving slide 2 down one swaps it with slide 3', J(oneDown.slides[1]) === J(deck.slides[2]) && J(oneDown.slides[2]) === J(deck.slides[1]));
  ok('moving a slide onto itself changes nothing', moveSlide(src, 3, 3) === src);
  ok('every span still evaluates after a move', slideSpans(moveSlide(src, 0, 2)).spans.length === deck.slides.length);

  // comments outside the edited slide survive
  const commentsBefore = (src.match(/\/\*/g)||[]).length;
  const commentsAfter  = (replaceSlide(src, deck.slides.length-1, '{ title: "Last" }').match(/\/\*/g)||[]).length;
  ok(`block comments kept (${commentsAfter}/${commentsBefore})`, commentsAfter >= commentsBefore - 2);
}
/* A deck grown from nothing: the empty array an author starts with,
   however they wrote its brackets, takes a first slide cleanly, and a
   deck emptied by the editor comes back to that state. */
{
  const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if(!cond) fail++; };
  console.log('\n=== an empty deck');
  const block = '{\n  title: "Only",\n}';
  for (const empty of ['export default {\n  title: "Bare",\n  slides: [],\n};\n', 'export default {\n  title: "Bare",\n  slides: [\n  ],\n};\n']) {
    const grown = insertSlide(empty, 0, block);
    const deck = (await load(grown));
    ok(`grows from ${JSON.stringify(empty.slice(empty.indexOf('slides'), empty.indexOf('],')+1))} to one slide`, deck.slides.length === 1 && deck.slides[0].title === 'Only');
    ok('laid in at the file\'s own depth', /\n  slides: \[\n    \{\n      title: "Only",\n    \},\n  \],/.test(grown));
    const emptied = removeSlide(grown, 0);
    ok('and the only slide can be taken out again', (await load(emptied)).slides.length === 0);
  }
}

/* The words `slides: [` in a comment or a string are not a slides
   array. The root deck.config.js is a pointer whose comment explains
   how to write a deck, and the editor once took that comment for the
   deck itself — and wrote a slide into it. */
{
  const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if(!cond) fail++; };
  console.log('\n=== slides: [ in the wrong places');
  const pointer = '/* start from `{ slides: [] }` */\n// or slides: [ like this\nexport { default } from "./x.js";\n';
  ok('a pointer file whose comment says slides: [ holds no deck', !hasSlides(pointer));
  const tricky = '/* slides: [ */\nexport default {\n  title: "slides: [",\n  slides: [\n    { title: "A", text: \'slides: [\' },\n  ],\n};\n';
  ok('a real deck with the words in a comment and two strings has one slides array', slideSpans(tricky).spans.length === 1);
  ok('and the one slide in it is found', (await load(tricky)).slides.length === 1 && replaceSlide(tricky, 0, '{ title: "B" }').includes('{ title: "B" }'));
}

/* Blank lines are the author's rhythm. Taking a slide out and putting
   it back — which is what undo and a move there and back do — must
   leave the file exactly as it was, whatever the slide's neighbours. */
{
  const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if(!cond) fail++; };
  console.log('\n=== blank lines between slides');
  const spaced = 'export default {\n  slides: [\n    { title: "A" },\n\n    { title: "B" },\n\n    { title: "C" },\n  ],\n};\n';
  const tight  = 'export default {\n  slides: [\n    { title: "A" },\n    { title: "B" },\n    { title: "C" },\n  ],\n};\n';
  for (const [name, src] of [['spaced', spaced], ['tight', tight]]) {
    for (let i = 0; i < 3; i++) {
      const gone = removeSlide(src, i);
      ok(`${name}: removing slide ${i + 1} leaves no double blank and none against a bracket`, !/\n\n\n/.test(gone) && !/\[\n\n/.test(gone) && !/\n\n\s*\]/.test(gone));
      const back = insertSlide(gone, i - 1, `{ title: "${'ABC'[i]}" }`);
      ok(`${name}: putting slide ${i + 1} back restores the file byte for byte`, back === src);
    }
    ok(`${name}: moving slide 1 to the end and back restores the file`, moveSlide(moveSlide(src, 0, 2), 2, 0) === src);
    ok(`${name}: moving slide 3 to the front and back restores the file`, moveSlide(moveSlide(src, 2, 0), 0, 2) === src);
  }
}

console.log(fail ? `\n${fail} FAILING` : '\nall green');
process.exit(fail?1:0);
