import { describe, expect, it } from "vitest";
import { convert, convertBaseline } from "../src/core/convert";
import { countSmallComponents } from "../src/core/region";
import {
  defaultSettings,
  EMPTY,
  geometryKey,
  type ConvertInput,
  type RegionConstraints,
} from "../src/model";
import { defaultPalette } from "../src/palettes";

const pixels = (
  width: number,
  height: number,
  values: Array<[number, number, number, number]>,
): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  values.forEach((value, index) => data.set(value, index * 4));
  return data;
};
const input = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  extra: Partial<typeof defaultSettings> = {},
  constraints?: RegionConstraints,
): ConvertInput => ({
  pixels: data,
  width,
  height,
  palette: defaultPalette,
  settings: {
    ...defaultSettings,
    algorithm: "region",
    longSide: width,
    maxColors: 4,
    smoothing: 0,
    ...extra,
  },
  constraints,
});
const constraintsFor = (
  width: number,
  height: number,
  settings: ConvertInput["settings"],
  overrides: Partial<RegionConstraints> = {},
): RegionConstraints => ({
  width,
  height,
  geometryKey: geometryKey(settings),
  protectedCells: [],
  regions: [],
  ...overrides,
});

const gradient = pixels(2, 2, [
  [240, 20, 20, 255],
  [20, 240, 20, 255],
  [20, 20, 240, 255],
  [240, 240, 20, 255],
]);

describe("region conversion", () => {
  it("runs automatic region mode without user masks", () => {
    expect(convert(input(gradient, 2, 2)).cells).toHaveLength(4);
  });
  it("rejects overlap between protected details and locked color regions", () => {
    const i = input(gradient, 2, 2);
    i.constraints = constraintsFor(2, 2, i.settings, {
      protectedCells: [0],
      regions: [{ id: "a", indices: [0], colors: [1] }],
    });
    expect(() => convert(i)).toThrow("重叠");
  });
  it("protects a black eye with enough color budget and rejects impossible protection budget", () => {
    const data = pixels(2, 2, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
    const i = input(data, 2, 2, { maxColors: 2, smoothing: 2 });
    i.constraints = constraintsFor(2, 2, i.settings, {
      protectedCells: [0, 1],
    });
    expect(convert(i).cells[0]).toBe(0);
    i.settings.maxColors = 1;
    expect(() => convert(i)).toThrow("颜色预算");
  });
  it("keeps fully transparent area empty when subpixel samples include sparse opaque marks", () => {
    const data = pixels(2, 2, [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = convert(
      input(data, 2, 2, { longSide: 1, alphaThreshold: 128 }),
    );
    expect(result.cells).toEqual([EMPTY]);
  });
  it("keeps same-cell same-color output under a one-color budget", () => {
    const settings = {
      ...defaultSettings,
      algorithm: "region" as const,
      longSide: 2,
      maxColors: 1,
      smoothing: 0 as const,
    };
    const c = constraintsFor(2, 2, settings);
    const result = convert({
      ...input(gradient, 2, 2, settings),
      settings,
      constraints: c,
    });
    expect(
      new Set(result.cells.filter((cell) => cell !== EMPTY)).size,
    ).toBeLessThanOrEqual(1);
  });

  it("is deterministic and records non-increasing ICM energy", () => {
    const settings = {
      ...defaultSettings,
      algorithm: "region" as const,
      longSide: 2,
      maxColors: 4,
      spatialStrength: 1 as const,
    };
    const c = constraintsFor(2, 2, settings);
    const first = convert({
      ...input(gradient, 2, 2, settings),
      settings,
      constraints: c,
    });
    const second = convert({
      ...input(gradient, 2, 2, settings),
      settings,
      constraints: c,
    });
    expect(second).toEqual(first);
    const energy = first.diagnostics!.energy;
    expect(
      energy.every(
        (value, index) => index === 0 || value <= energy[index - 1] + 1e-9,
      ),
    ).toBe(true);
  });

  it("includes locked colors in the global candidate set and enforces region subsets", () => {
    const settings = {
      ...defaultSettings,
      algorithm: "region" as const,
      longSide: 2,
      maxColors: 2,
      smoothing: 0 as const,
    };
    const c = constraintsFor(2, 2, settings, {
      regions: [{ id: "locked", indices: [0, 1], colors: [3] }],
    });
    const result = convert({
      ...input(gradient, 2, 2, settings),
      settings,
      constraints: c,
    });
    expect(result.cells[0]).toBe(3);
    expect(result.cells[1]).toBe(3);
    expect(
      new Set(result.cells.filter((cell) => cell !== EMPTY)).size,
    ).toBeLessThanOrEqual(2);
  });

  it("rejects conflicting locks and locked-color budget overflow", () => {
    const settings = {
      ...defaultSettings,
      algorithm: "region" as const,
      longSide: 2,
      maxColors: 1,
      smoothing: 0 as const,
    };
    const overlap = constraintsFor(2, 2, settings, {
      regions: [
        { id: "a", indices: [0], colors: [1] },
        { id: "b", indices: [0], colors: [2] },
      ],
    });
    expect(() =>
      convert({
        ...input(gradient, 2, 2, settings),
        settings,
        constraints: overlap,
      }),
    ).toThrow();
    const overflow = constraintsFor(2, 2, settings, {
      regions: [{ id: "a", indices: [0], colors: [1, 2] }],
    });
    expect(() =>
      convert({
        ...input(gradient, 2, 2, settings),
        settings,
        constraints: overflow,
      }),
    ).toThrow("超过颜色预算");
  });

  it("preserves transparent cells as EMPTY and a protected cell as non-empty", () => {
    const settings = {
      ...defaultSettings,
      algorithm: "region" as const,
      longSide: 2,
      maxColors: 2,
      smoothing: 2 as const,
    };
    const data = pixels(2, 2, [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 255, 255],
    ]);
    const c = constraintsFor(2, 2, settings, { protectedCells: [0] });
    const result = convert({
      ...input(data, 2, 2, settings),
      settings,
      constraints: c,
    });
    expect(result.cells[0]).not.toBe(EMPTY);
    expect(result.cells[1]).toBe(EMPTY);
  });

  it("ignores or rejects dithering in region mode rather than silently applying it", () => {
    const settings = {
      ...defaultSettings,
      algorithm: "region" as const,
      longSide: 2,
      maxColors: 2,
      dithering: true,
    };
    const c = constraintsFor(2, 2, settings);
    expect(() =>
      convert({ ...input(gradient, 2, 2, settings), settings, constraints: c }),
    ).toThrow("抖动");
  });

  it("exports small-component counting for measurable diagnostics", () => {
    expect(countSmallComponents([0, 1, 1, 0], 2, 2, 1)).toBe(4);
    expect(
      convertBaseline({
        ...input(gradient, 2, 2),
        settings: { ...defaultSettings, longSide: 2 },
      }).algorithmVersion,
    ).toContain("v1");
  });
});
