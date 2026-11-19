// Matching for the top-bar search (task 0107): pure, on the device, no request per keystroke. A query is split into words; EVERY word must be found somewhere in a destination (its title, its
// trail, the words people use for it, its line of description, its steps) or it is not a result; the better the place a word is found in, the higher the result ranks. One slip in a word of five
// letters or more is forgiven, so "setings" still finds Settings.

export type Searchable = {
  title: string;
  /// Where it lives, outermost first: ["Settings", "Sign-in access"].
  trail: readonly string[];
  /// Words people use that the title does not contain ("fees", "login").
  keywords?: readonly string[];
  /// One line about what is there.
  summary: string;
  steps?: readonly string[];
};

/// Lower case, accents off, so "Résumé" and "resume" are the same word.
export const normalise = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const wordsOf = (text: string): string[] =>
  normalise(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/// True when `a` and `b` differ by at most one slip: a letter more, a letter fewer, a letter changed, or two neighbouring letters swapped.
export function withinOneSlip(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // one letter changed
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // two neighbours swapped
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i); // one letter more or fewer
}

/// How good the place is where one query word was found. The numbers only order the places: a title beats a trail beats a keyword beats the description.
const PLACE = { titleWord: 100, titleStart: 90, trail: 70, keyword: 60, titleInside: 50, text: 30, slip: 20 } as const;

function scoreWord(word: string, parts: { title: string[]; trail: string[]; keywords: string[]; text: string[] }): number {
  let best = 0;
  const consider = (score: number) => {
    if (score > best) best = score;
  };
  for (const [index, t] of parts.title.entries()) {
    if (t === word) consider(PLACE.titleWord);
    else if (t.startsWith(word)) consider(index === 0 ? PLACE.titleStart : PLACE.titleWord - 15);
    else if (word.length >= 3 && t.includes(word)) consider(PLACE.titleInside);
  }
  for (const t of parts.trail) if (t === word || t.startsWith(word)) consider(PLACE.trail);
  for (const t of parts.keywords) if (t === word || t.startsWith(word)) consider(PLACE.keyword);
  for (const t of parts.text) if (t === word || t.startsWith(word)) consider(PLACE.text);
  if (best === 0 && word.length >= 5) {
    for (const t of [...parts.title, ...parts.keywords, ...parts.trail]) if (t.length >= 4 && withinOneSlip(word, t)) consider(PLACE.slip);
  }
  return best;
}

/// 0 when the item is not a result for the query (a word is nowhere), otherwise a score to rank by (higher is better).
export function scoreOf(query: string, item: Searchable): number {
  const words = wordsOf(query);
  if (words.length === 0) return 0;
  const parts = {
    title: wordsOf(item.title),
    trail: item.trail.flatMap(wordsOf),
    keywords: (item.keywords ?? []).flatMap(wordsOf),
    text: [...wordsOf(item.summary), ...(item.steps ?? []).flatMap(wordsOf)],
  };
  let total = 0;
  for (const word of words) {
    const s = scoreWord(word, parts);
    if (s === 0) return 0;
    total += s;
  }
  const whole = normalise(query).trim();
  const title = normalise(item.title);
  if (title === whole) total += 80;
  else if (title.startsWith(whole)) total += 50;
  return total;
}

/// The results for a query, best first (ties keep the order of the list they came from, so the index's own order is the tie-break). `limit` caps the count.
export function search<T extends Searchable>(query: string, items: readonly T[], limit = Infinity): T[] {
  return items
    .map((item, order) => ({ item, order, score: scoreOf(query, item) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((r) => r.item);
}

/// Splits `text` into pieces, marking the parts that a word of the query starts (for drawing the match in bold). Case and accents are ignored; the pieces give back the original text.
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const words = wordsOf(query);
  if (words.length === 0) return [{ text, match: false }];
  const plain = normalise(text);
  // normalise() can change a string's length (it never does for the letters used here, but a decomposed accent could): when it does, do not guess, draw the text plain.
  if (plain.length !== text.length) return [{ text, match: false }];
  const marked = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = plain.indexOf(word, from);
      if (at < 0) break;
      const atWordStart = at === 0 || !/[a-z0-9]/.test(plain[at - 1]!);
      if (atWordStart) for (let i = at; i < at + word.length; i++) marked[i] = true;
      from = at + 1;
    }
  }
  const pieces: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = pieces[pieces.length - 1];
    if (last && last.match === marked[i]) last.text += text[i];
    else pieces.push({ text: text[i]!, match: marked[i]! });
  }
  return pieces;
}
