export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits `text` into plain and highlighted parts for every (case-insensitive) occurrence of `phrases`. */
export function highlightSegments(text: string, phrases: string[]): Segment[] {
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const phrase of phrases) {
    const q = phrase.trim().toLowerCase();
    if (!q) continue;
    for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
      ranges.push([i, i + q.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }

  const out: Segment[] = [];
  let pos = 0;
  for (const [start, end] of merged) {
    if (start > pos) out.push({ text: text.slice(pos, start), hit: false });
    out.push({ text: text.slice(start, end), hit: true });
    pos = end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
  return out;
}
