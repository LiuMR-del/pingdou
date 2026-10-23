import { describe, expect, it } from 'vitest';
import { ciede2000 } from '../src/core/ciede2000';
import { convert } from '../src/core/convert';
import { usage, totalBeads } from '../src/core/statistics';
import { EMPTY, defaultSettings, type ConvertInput, type Pattern, type Settings } from '../src/model';
import { defaultPalette } from '../src/palettes';

const pixel = (width: number, height: number, fill: [number, number, number, number]): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4);
  return data;
};

const input = (pixels: Uint8ClampedArray, width: number, height: number, settings: Partial<Settings> = {}): ConvertInput => ({
  pixels, width, height, palette: defaultPalette, settings: { ...defaultSettings, ...settings },
});

const testPattern = (cells: number[]): Pattern => ({
  width: cells.length, height: 1, cells, palette: defaultPalette, settings: defaultSettings, algorithmVersion: 'test', durationMs: 0,
});

describe('CIEDE2000', () => {
  it('matches Sharma et al. reference pair 1', () => {
    expect(ciede2000({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.0425, 4);
  });

  it('matches Sharma et al. reference pair 2', () => {
    expect(ciede2000({ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.8615, 4);
  });
});

describe('convert', () => {
  it('uses EMPTY for transparent cells and preserves requested aspect ratio', () => {
    const result = convert(input(pixel(4, 2, [255, 0, 0, 0]), 4, 2, { longSide: 8, alphaThreshold: 128 }));
    expect(result.width).toBe(8);
    expect(result.height).toBe(4);
    expect(result.cells.every((cell) => cell === EMPTY)).toBe(true);
  });

  it('is deterministic for identical input and settings', () => {
    const pixels = pixel(3, 2, [220, 40, 80, 255]);
    const settings = { longSide: 12, maxColors: 4, dithering: true, cleanup: true };
    expect(convert(input(pixels, 3, 2, settings))).toEqual(convert(input(pixels, 3, 2, settings)));
  });

  it('keeps actual palette colors within the configured limit', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      255, 255, 0, 255, 255, 0, 255, 255, 0, 255, 255, 255,
    ]);
    const result = convert(input(pixels, 3, 2, { longSide: 24, maxColors: 3 }));
    expect(new Set(result.cells.filter((cell) => cell !== EMPTY)).size).toBeLessThanOrEqual(3);
    expect(result.cells.filter((cell) => cell !== EMPTY).every((cell) => cell >= 0 && cell < defaultPalette.colors.length)).toBe(true);
  });

  it('reports usage and total beads consistently', () => {
    const pattern = testPattern([0, 1, EMPTY, 1, 2, EMPTY]);
    expect(usage(pattern).map(({ index, count }) => [index, count])).toEqual([[0, 1], [1, 2], [2, 1]]);
    expect(totalBeads(pattern)).toBe(4);
    expect(usage(pattern).reduce((sum, item) => sum + item.count, 0)).toBe(totalBeads(pattern));
  });

  it('uses alpha compositing against the configured background', () => {
    const transparentRed = convert(input(pixel(1, 1, [255, 0, 0, 128]), 1, 1, { longSide: 1, alphaThreshold: 1, background: '#0000ff' }));
    const opaquePurple = convert(input(pixel(1, 1, [188, 0, 187, 255]), 1, 1, { longSide: 1, alphaThreshold: 1, background: '#0000ff' }));
    expect(transparentRed.cells[0]).toBe(opaquePurple.cells[0]);
  });
});
