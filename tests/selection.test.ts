import { describe, expect, it } from 'vitest';
import { growRegion } from '../src/editor/regions';
import { EMPTY, defaultSettings, type Pattern } from '../src/model';
import { defaultPalette } from '../src/palettes';

function pattern(width: number, height: number, cells: number[]): Pattern {
  return {
    width,
    height,
    cells,
    palette: defaultPalette,
    settings: defaultSettings,
    algorithmVersion: 'test',
    durationMs: 0,
  };
}

describe('growRegion', () => {
  it('grows only through four-neighbour cells and never crosses EMPTY', () => {
    const cells = [
      0, 0, EMPTY, 0,
      0, 0, EMPTY, 0,
      EMPTY, 0, 0, 0,
    ];
    const result = growRegion(pattern(4, 3, cells), 0, 0);
    expect(result.sort((a, b) => a - b)).toEqual([0, 1, 3, 4, 5, 7, 9, 10, 11]);
    expect(result).not.toContain(2);
    expect(result).not.toContain(8);
  });

  it('compares every candidate with the seed to prevent colour-chain drift', () => {
    const red = 12;
    const nearRed = 11;
    const farFromRed = 28;
    const cells = [red, nearRed, farFromRed];
    const result = growRegion(pattern(3, 1, cells), 0, 15);
    expect(result).toContain(0);
    expect(result).toContain(1);
    expect(result).not.toContain(2);
  });

  it('returns no cells when the seed is outside the pattern or EMPTY', () => {
    expect(growRegion(pattern(2, 1, [EMPTY, 0]), 0, 100)).toEqual([]);
    expect(growRegion(pattern(2, 1, [0, 0]), 8, 100)).toEqual([]);
  });
});
