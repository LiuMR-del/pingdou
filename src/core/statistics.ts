import { EMPTY } from '../model';
import type { ColorUsage, Pattern } from '../model';

export function usage(pattern: Pattern): ColorUsage[] {
  const counts = new Map<number, number>();
  for (const index of pattern.cells) {
    if (index !== EMPTY) counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, count]) => ({ index, color: pattern.palette.colors[index], count }));
}

export function totalBeads(pattern: Pattern): number {
  return pattern.cells.reduce((total, index) => total + (index === EMPTY ? 0 : 1), 0);
}
