const CATEGORY_COLORS: Record<string, string> = {
  academic: '#1565C0',
  housing: '#6A1B9A',
  athletics: '#2E7D32',
  dining: '#EF6C00',
};

export const PLACE_DEFAULT_COLOR = '#455A64';

const PLACE_DOT_COLORS_BY_RANK = ['#B0B0B0', '#909090', '#606060'];

export function placeColor(place: {
  categories: string[];
  labelRank: number;
}): string {
  if (place.labelRank <= 2) {
    return PLACE_DOT_COLORS_BY_RANK[place.labelRank] ?? PLACE_DEFAULT_COLOR;
  }
  const first = place.categories[0];
  return (first && CATEGORY_COLORS[first]) ?? PLACE_DEFAULT_COLOR;
}