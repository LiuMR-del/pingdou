import { describe, expect, it } from "vitest";
import { convert } from "../src/core/convert";
import { rgbToLab, paletteLabs } from "../src/core/color";
import { ciede2000 } from "../src/core/ciede2000";
import { EMPTY } from "../src/model";
import {
  refinePaletteOnce,
  convertPaletteCandidate,
} from "../scripts/research/palette-refinement";
import { gradientTexture } from "./fixtures/conversion";

const labs = [
  rgbToLab(0, 0, 0),
  rgbToLab(255, 255, 255),
  rgbToLab(240, 30, 50),
  rgbToLab(0, 0, 0),
];
const points = [
  { lab: labs[0], weight: 10 },
  { lab: labs[2], weight: 1 },
];
const objective = (indices: number[], ps = points) =>
  ps.reduce(
    (sum, p) =>
      sum +
      Math.min(...indices.map((i) => ciede2000(p.lab, labs[i]))) * p.weight,
    0,
  );

describe("one-swap research palette", () => {
  it("chooses the best single replacement without adding colors", () => {
    const result = refinePaletteOnce(points, labs, [1]);
    expect(result.allowed).toEqual([0]);
    expect(result.before).toBeCloseTo(objective([1]));
    expect(result.after).toBeCloseTo(objective([0]));
    expect(result.swapped).toEqual({ removed: 1, added: 0 });
  });
  it("preserves palette order for exact or tied solutions and duplicate colors", () => {
    expect(refinePaletteOnce(points, labs, [0, 2]).allowed).toEqual([0, 2]);
    const result = refinePaletteOnce([{ lab: labs[0], weight: 1 }], labs, [3]);
    expect(result.allowed).toEqual([3]);
    expect(result.swapped).toBeNull();
  });
  it("returns the original when only adding a third color would improve it", () => {
    const ps = [...points, { lab: labs[1], weight: 0.001 }];
    const result = refinePaletteOnce(ps, labs, [0, 2]);
    expect(result.allowed).toEqual([0, 2]);
    expect(result.after).toBe(result.before);
  });
  it("handles empty samples and rejects invalid palette indices", () => {
    expect(refinePaletteOnce([], labs, []).allowed).toEqual([]);
    expect(() => refinePaletteOnce(points, labs, [20])).toThrow();
    expect(() => refinePaletteOnce(points, labs, [0, 0])).toThrow();
  });
  it("matches an exhaustive one-swap oracle on a weighted fixture", () => {
    const ps = [0, 1, 2].map((i) => ({ lab: labs[i], weight: i + 1 }));
    const result = refinePaletteOnce(ps, labs, [1, 3]);
    const scores = [
      [1, 3],
      [0, 3],
      [1, 0],
      [2, 3],
      [1, 2],
    ].map((ids) => objective(ids, ps));
    expect(result.after).toBeCloseTo(Math.min(...scores));
  });
  it("considers a compromise color that is not the nearest to any sample", () => {
    const neutral = [0, 40, 50, 60].map((l) => ({ l, a: 0, b: 0 }));
    const ps = [1, 3].map((i) => ({ lab: neutral[i], weight: 2 }));
    const result = refinePaletteOnce(ps, neutral, [0]);
    const scores = neutral.map((lab) =>
      ps.reduce((sum, p) => sum + ciede2000(p.lab, lab) * p.weight, 0),
    );
    expect(result.allowed).toEqual([2]);
    expect(result.after).toBeCloseTo(Math.min(...scores));
  });
  it("rejects region-path settings instead of mislabeling the output", () => {
    const input = gradientTexture();
    input.settings.algorithm = "region";
    expect(() => convertPaletteCandidate(input)).toThrow("baseline");
  });
  it.each([8, 16])(
    "is deterministic and respects a %i-color budget",
    (maxColors) => {
      const input = gradientTexture();
      input.settings.maxColors = maxColors;
      const snapshot = structuredClone(input);
      const result = convertPaletteCandidate(input);
      expect(convertPaletteCandidate(input)).toEqual(result);
      expect(input).toEqual(snapshot);
      expect(result.refinement.after).toBeLessThanOrEqual(
        result.refinement.before + 1e-9,
      );
      const occupied = result.pattern.cells.filter((i) => i !== EMPTY);
      expect(new Set(occupied).size).toBeLessThanOrEqual(maxColors);
      expect(
        occupied.every(
          (i) =>
            Number.isInteger(i) &&
            i >= 0 &&
            i < paletteLabs(input.palette).length,
        ),
      ).toBe(true);
      expect(convert(input).algorithmVersion).toBe(
        "linear-area-lab-kmeans12-ciede2000-v1",
      );
    },
  );
  it("preserves all-transparent and sparse-transparent cell geometry", () => {
    const input = gradientTexture();
    input.pixels.fill(0);
    const empty = convertPaletteCandidate(input);
    expect(empty.pattern.cells.every((i) => i === EMPTY)).toBe(true);
    expect(empty.refinement.swapped).toBeNull();
    input.pixels.set([230, 187, 147, 255], 0);
    input.settings.alphaThreshold = 1;
    const candidate = convertPaletteCandidate(input).pattern;
    expect(candidate.cells.map((i) => i === EMPTY)).toEqual(
      convert(input).cells.map((i) => i === EMPTY),
    );
  });
  it("does not mix the research candidate with dithering or cleanup", () => {
    const input = gradientTexture();
    input.settings.cleanup = true;
    expect(() => convertPaletteCandidate(input)).toThrow("disabled");
    input.settings.cleanup = false;
    input.settings.dithering = true;
    expect(() => convertPaletteCandidate(input)).toThrow("disabled");
  });
});
