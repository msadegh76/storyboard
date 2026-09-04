/* The reveal: press A and the wall zooms out into a chat thread,
   docked inside the assistant's picture frame as though it had just
   been generated there. It hasn't: the wall is still live behind the
   frame, still listening to the arrow keys. That's the joke.

   Deliberately independent. It talks to the wall through exactly two
   DOM nodes and no shared state, so neither can break the other. */

/* The reveal is decorative, so a page without its markup simply does
   not have one. Everything it needs is found in one go — a nested
   function cannot see a null check made outside it, and this way it
   does not have to. */
function nodes() {
  const root = document.getElementById("app-root");
  const reveal = document.getElementById("reveal");
  const frame = document.getElementById("revealFrame");
  const shimmer = document.getElementById("reveal-shimmer");
  const thread = reveal?.querySelector<HTMLElement>(".thread");
  const wrap = reveal?.querySelector<HTMLElement>(".wrap");
  if (!root || !reveal || !frame || !shimmer || !thread || !wrap) return null;
  return { root, reveal, frame, shimmer, thread, wrap };
}

export function initReveal() {
  const found = nodes();
  if (!found) return;
  const { root, reveal, frame, shimmer, thread, wrap } = found;

  let open = false;
  let shimmerT = 0;
  const RADIUS = 14; // px, as it should read *after* the shrink
  const SHIMMER_MS = 900;

  /* The frame takes the viewport's own proportions so the wall
     lands in it exactly, then shrinks to whatever height the
     thread has left over once the bubbles have had their share. */
  function sizeFrame() {
    var ratio = innerWidth / Math.max(1, innerHeight);
    frame.style.width = "0px";
    frame.style.height = "0px";
    var pad = getComputedStyle(thread);
    var room =
      thread.clientHeight -
      parseFloat(pad.paddingTop) -
      parseFloat(pad.paddingBottom) -
      wrap.offsetHeight;
    /* clamped to the reply body, which is the frame's own parent —
       narrower than the thread by the width of the avatar column */
    var w = Math.max(
      220,
      Math.min(frame.parentElement?.clientWidth ?? Infinity, room * ratio)
    );
    frame.style.width = w + "px";
    frame.style.height = w / ratio + "px";
  }

  /* One uniform scale plus a translate, from the viewport's top-left
     (transform-origin: 0 0) to the frame's. `contain` rather than
     `cover` so a mismatched ratio letterboxes instead of spilling. */
  function dock() {
    sizeFrame();
    var r = frame.getBoundingClientRect();
    var s = Math.min(r.width / innerWidth, r.height / innerHeight);
    var x = r.left + (r.width - innerWidth * s) / 2;
    var y = r.top + (r.height - innerHeight * s) / 2;
    root.style.transform =
      "translate(" + x + "px, " + y + "px) scale(" + s + ")";
    /* the transform shrinks the radius and shadow along with
       everything else, so divide them out first */
    root.style.borderRadius = RADIUS / s + "px";
    root.style.boxShadow =
      "0 " + 34 / s + "px " + 80 / s + "px rgba(24,18,10,.34), 0 " +
      3 / s + "px " + 12 / s + "px rgba(24,18,10,.2)";
    shimmer.style.left = r.left + "px";
    shimmer.style.top = r.top + "px";
    shimmer.style.width = r.width + "px";
    shimmer.style.height = r.height + "px";
    shimmer.style.borderRadius = RADIUS + "px";
  }

  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    clearTimeout(shimmerT);
    reveal.classList.toggle("open", open);
    root.classList.toggle("docked", open);
    if (open) {
      dock();
      shimmer.classList.add("on");
      shimmerT = setTimeout(function () {
        shimmer.classList.remove("on");
      }, SHIMMER_MS);
    } else {
      shimmer.classList.remove("on");
      root.style.transform = "translate(0px, 0px) scale(1)";
      root.style.borderRadius = "";
      root.style.boxShadow = "";
    }
  }

  function typing(el: EventTarget | null) {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable === true
    );
  }

  /* Capture phase: when the reveal is open, Escape belongs to it and
     must not reach the wall, which reads Escape as "back to stop 1". */
  addEventListener(
    "keydown",
    function (e) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) return;
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    },
    true
  );

  /* The frame moves and resizes with the window, and the wall has to
     follow it there. Watching the document box as well as the resize
     event catches the cases a plain resize misses — an embedded or
     panelled viewport that changes size without firing one. */
  function follow() {
    if (open) dock();
  }
  addEventListener("resize", follow);
  if (window.ResizeObserver)
    new ResizeObserver(follow).observe(document.documentElement);
}
