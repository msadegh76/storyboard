/* What a deck got wrong, collected rather than thrown.

   A deck is read at the moment it is presented. Refusing the whole wall
   over one misspelt word means the other seventeen slides are lost too,
   five minutes before they were needed — so a card with a bad value
   falls back to the default for that field and says so, loudly, in the
   console. What cannot be recovered from still stops everything: a
   slide with no cards has nothing to show.

   The checker catches most of these while the deck is being written,
   which is where they belong. This is the net under that — and it is
   its own module because two readers report into it: the schema, as
   the deck is read, and the image loader, later, when a picture the
   deck asked for never arrives. */

const complaints: string[] = [];

/** Everything the deck got wrong, in the order it was found. */
export const deckComplaints = () => complaints.slice();

export function complain(where: string, msg: string) {
  const line = `promise-wall: ${where} — ${msg}`;
  complaints.push(line);
  console.warn(line);
}
