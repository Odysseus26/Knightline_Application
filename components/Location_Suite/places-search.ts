import type { Place } from "../api";

export type PlaceMatch = {
  place: Place;
  score: number;
};

export function searchPlaces(
  places: Place[],
  query: string,
  limit = 20,
): PlaceMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const out: PlaceMatch[] = [];
  for (const place of places) {
    const name = place.name.toLowerCase();
    const idx = name.indexOf(q);
    if (idx === -1) continue;

    let score = 0;
    if (name === q) score = 1000;
    else if (idx === 0) score = 500 - name.length;
    else score = 100 - idx;
    score += (place.labelRank ?? 0) * 2;

    out.push({ place, score });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}