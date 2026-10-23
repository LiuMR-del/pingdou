import { ciede2000 } from "../core/ciede2000";
import { hexToRgb, rgbToLab } from "../core/color";
import { EMPTY, type Pattern } from "../model";

/**
 * Grows a four-connected region from a cell whose colour is close to the seed.
 * Every candidate is compared with the original seed colour, rather than with
 * the previously accepted cell. This prevents a gradual colour chain from
 * leaking through a region.
 */
export function growRegion(
  pattern: Pattern,
  seed: number,
  tolerance: number,
): number[] {
  const { width, height, cells, palette } = pattern;
  const size = width * height;
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed >= size ||
    cells[seed] === EMPTY
  )
    return [];

  const seedColor = palette.colors[cells[seed]];
  if (!seedColor) return [];
  const seedRgb = hexToRgb(seedColor.hex);
  const seedLab = rgbToLab(seedRgb[0], seedRgb[1], seedRgb[2]);
  const limit = Math.max(0, Number.isFinite(tolerance) ? tolerance : 0);
  const seen = new Uint8Array(size);
  const result: number[] = [];
  const queue: number[] = [seed];
  seen[seed] = 1;

  while (queue.length) {
    const index = queue.shift()!;
    result.push(index);
    const row = Math.floor(index / width);
    const col = index % width;
    const neighbours = [
      col > 0 ? index - 1 : -1,
      col + 1 < width ? index + 1 : -1,
      row > 0 ? index - width : -1,
      row + 1 < height ? index + width : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || seen[next]) continue;
      seen[next] = 1;
      const value = cells[next];
      if (value === EMPTY) continue;
      const color = palette.colors[value];
      if (!color) continue;
      const rgb = hexToRgb(color.hex);
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      if (ciede2000(seedLab, lab) <= limit) queue.push(next);
    }
  }
  return result;
}
