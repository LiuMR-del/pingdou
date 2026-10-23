import {
  dimensions,
  geometryKey,
  type ConvertInput,
  type RegionConstraints,
} from "../model";
import {
  hexToRgb,
  rgbToLab,
  srgbToLinear,
  linearToSrgb,
  type Lab,
} from "./color";

export interface RegionSample {
  lab: Lab;
  empty: boolean;
}
export interface PreprocessedRegion {
  width: number;
  height: number;
  samples: RegionSample[];
  protectedCells: Set<number>;
  regionByCell: Int32Array;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const emptySample = (): RegionSample => ({
  lab: { l: 0, a: 0, b: 0 },
  empty: true,
});
const BYTE_LINEAR = Array.from({ length: 256 }, (_, i) =>
  srgbToLinear(i / 255),
);

function compositedSourcePixel(
  input: ConvertInput,
  sx: number,
  sy: number,
): RegionSample {
  const { pixels, width, settings } = input;
  const i =
    (clamp(sy, 0, input.height - 1) * width + clamp(sx, 0, width - 1)) * 4;
  const alpha = pixels[i + 3] / 255;
  if (alpha * 255 < settings.alphaThreshold || alpha === 0)
    return emptySample();
  const bg = hexToRgb(settings.background).map((v) => srgbToLinear(v / 255));
  const r = BYTE_LINEAR[pixels[i]] * alpha + bg[0] * (1 - alpha);
  const g = BYTE_LINEAR[pixels[i + 1]] * alpha + bg[1] * (1 - alpha);
  const b = BYTE_LINEAR[pixels[i + 2]] * alpha + bg[2] * (1 - alpha);
  return {
    lab: rgbToLab(
      linearToSrgb(r) * 255,
      linearToSrgb(g) * 255,
      linearToSrgb(b) * 255,
    ),
    empty: false,
  };
}

function areaSample(
  input: ConvertInput,
  left: number,
  top: number,
  right: number,
  bottom: number,
): RegionSample {
  const { pixels, width, height, settings } = input;
  const bg = hexToRgb(settings.background).map((v) => srgbToLinear(v / 255));
  let r = 0,
    g = 0,
    b = 0,
    alpha = 0,
    weight = 0;
  for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++)
    for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
      const w =
        (Math.min(right, sx + 1) - Math.max(left, sx)) *
        (Math.min(bottom, sy + 1) - Math.max(top, sy));
      if (w <= 0) continue;
      const i =
        (clamp(sy, 0, height - 1) * width + clamp(sx, 0, width - 1)) * 4;
      const a = pixels[i + 3] / 255;
      r += (BYTE_LINEAR[pixels[i]] * a + bg[0] * (1 - a)) * w;
      g += (BYTE_LINEAR[pixels[i + 1]] * a + bg[1] * (1 - a)) * w;
      b += (BYTE_LINEAR[pixels[i + 2]] * a + bg[2] * (1 - a)) * w;
      alpha += a * w;
      weight += w;
    }
  if (
    !weight ||
    (alpha / weight) * 255 < settings.alphaThreshold ||
    alpha === 0
  )
    return emptySample();
  return {
    lab: rgbToLab(
      linearToSrgb(r / weight) * 255,
      linearToSrgb(g / weight) * 255,
      linearToSrgb(b / weight) * 255,
    ),
    empty: false,
  };
}

function targetRegionMap(
  width: number,
  height: number,
  constraints: RegionConstraints,
): Int32Array {
  const result = new Int32Array(width * height);
  result.fill(-1);
  constraints.regions.forEach((region, regionIndex) =>
    region.indices.forEach((index) => {
      result[index] = regionIndex;
    }),
  );
  return result;
}

function middleTargetIndex(
  x: number,
  y: number,
  middleWidth: number,
  middleHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  const tx = Math.min(
    targetWidth - 1,
    Math.floor((x * targetWidth) / middleWidth),
  );
  const ty = Math.min(
    targetHeight - 1,
    Math.floor((y * targetHeight) / middleHeight),
  );
  return ty * targetWidth + tx;
}

function contrastFromMiddle(
  input: RegionSample[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): RegionSample {
  const candidates: { sample: RegionSample; score: number }[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const current = input[y * width + x];
      if (current.empty) continue;
      let score = 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbour = input[ny * width + nx];
        if (!neighbour.empty)
          score +=
            Math.abs(current.lab.l - neighbour.lab.l) +
            Math.abs(current.lab.a - neighbour.lab.a) +
            Math.abs(current.lab.b - neighbour.lab.b);
      }
      candidates.push({ sample: current, score });
    }
  if (!candidates.length) return emptySample();
  const max = Math.max(...candidates.map((c) => c.score));
  let l = 0,
    a = 0,
    b = 0,
    total = 0;
  for (const candidate of candidates) {
    // Contrast is a bounded bias, not an extreme-pixel replacement for area sampling.
    const weight = 1 + (max > 0 ? candidate.score / max : 0);
    l += candidate.sample.lab.l * weight;
    a += candidate.sample.lab.a * weight;
    b += candidate.sample.lab.b * weight;
    total += weight;
  }
  return { lab: { l: l / total, a: a / total, b: b / total }, empty: false };
}

function bilateral(
  input: RegionSample[],
  middleWidth: number,
  middleHeight: number,
  targetWidth: number,
  targetHeight: number,
  passes: number,
  protectedCells: Set<number>,
  targetRegions: Int32Array,
): RegionSample[] {
  let current = input;
  const range = 18;
  for (let pass = 0; pass < passes; pass++) {
    const next = current.map((v) => ({ lab: { ...v.lab }, empty: v.empty }));
    for (let y = 0; y < middleHeight; y++)
      for (let x = 0; x < middleWidth; x++) {
        const i = y * middleWidth + x;
        const targetIndex = middleTargetIndex(
          x,
          y,
          middleWidth,
          middleHeight,
          targetWidth,
          targetHeight,
        );
        if (protectedCells.has(targetIndex) || current[i].empty) continue;
        const region = targetRegions[targetIndex];
        let l = 0,
          a = 0,
          b = 0,
          total = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= middleWidth || ny >= middleHeight)
              continue;
            const ni = ny * middleWidth + nx;
            const neighbourTarget = middleTargetIndex(
              nx,
              ny,
              middleWidth,
              middleHeight,
              targetWidth,
              targetHeight,
            );
            // Boundaries and protected projections are hard barriers; EMPTY never crosses.
            if (
              targetRegions[neighbourTarget] !== region ||
              protectedCells.has(neighbourTarget)
            )
              continue;
            const neighbour = current[ni];
            if (neighbour.empty) continue;
            const spatial = Math.exp(-(dx * dx + dy * dy) / 2);
            const dl = current[i].lab.l - neighbour.lab.l,
              da = current[i].lab.a - neighbour.lab.a,
              db = current[i].lab.b - neighbour.lab.b;
            const weight =
              spatial *
              Math.exp(-(dl * dl + da * da + db * db) / (2 * range * range));
            l += neighbour.lab.l * weight;
            a += neighbour.lab.a * weight;
            b += neighbour.lab.b * weight;
            total += weight;
          }
        if (total)
          next[i] = {
            lab: { l: l / total, a: a / total, b: b / total },
            empty: false,
          };
      }
    current = next;
  }
  return current;
}

export function preprocessRegion(
  input: ConvertInput,
  constraints: RegionConstraints,
): PreprocessedRegion {
  const target = dimensions(input.width, input.height, input.settings.longSide);
  if (
    constraints.width !== target.width ||
    constraints.height !== target.height
  )
    throw new Error("区域约束尺寸与输出图纸不一致");
  if (constraints.geometryKey !== geometryKey(input.settings))
    throw new Error("区域约束已过期，请重新生成");
  const cellCount = target.width * target.height;
  const protectedCells = new Set(constraints.protectedCells);
  if ([...protectedCells].some((index) => index < 0 || index >= cellCount))
    throw new Error("保护格索引超出图纸范围");
  const regionByCell = targetRegionMap(
    target.width,
    target.height,
    constraints,
  );
  const claimed = new Set<number>();
  for (const region of constraints.regions) {
    if (region.colors.length < 1 || region.colors.length > 3)
      throw new Error("区域锁色必须为1至3种");
    for (const index of region.indices) {
      if (index < 0 || index >= cellCount || claimed.has(index))
        throw new Error("区域约束存在重叠或越界格子");
      claimed.add(index);
    }
  }
  const scale = 2;
  const middleWidth = Math.min(
    target.width * 4,
    Math.max(target.width, Math.min(input.width, target.width * scale)),
  );
  const middleHeight = Math.min(
    target.height * 4,
    Math.max(target.height, Math.min(input.height, target.height * scale)),
  );
  const middle: RegionSample[] = [];
  for (let y = 0; y < middleHeight; y++)
    for (let x = 0; x < middleWidth; x++) {
      const left = (x * input.width) / middleWidth,
        right = ((x + 1) * input.width) / middleWidth;
      const top = (y * input.height) / middleHeight,
        bottom = ((y + 1) * input.height) / middleHeight;
      middle.push(areaSample(input, left, top, right, bottom));
    }
  const smoothed = bilateral(
    middle,
    middleWidth,
    middleHeight,
    target.width,
    target.height,
    input.settings.smoothing ?? 0,
    protectedCells,
    regionByCell,
  );
  const samples: RegionSample[] = [];
  for (let y = 0; y < target.height; y++)
    for (let x = 0; x < target.width; x++) {
      const ti = y * target.width + x;
      if (input.settings.mode === "pixel") {
        samples.push(
          compositedSourcePixel(
            input,
            Math.min(
              input.width - 1,
              Math.floor(((x + 0.5) * input.width) / target.width),
            ),
            Math.min(
              input.height - 1,
              Math.floor(((y + 0.5) * input.height) / target.height),
            ),
          ),
        );
        continue;
      }
      const coverage = areaSample(
        input,
        (x * input.width) / target.width,
        (y * input.height) / target.height,
        ((x + 1) * input.width) / target.width,
        ((y + 1) * input.height) / target.height,
      );
      if (coverage.empty) {
        samples.push(coverage);
        continue;
      }
      const x0 = Math.floor((x * middleWidth) / target.width),
        x1 = Math.max(
          x0 + 1,
          Math.ceil(((x + 1) * middleWidth) / target.width),
        );
      const y0 = Math.floor((y * middleHeight) / target.height),
        y1 = Math.max(
          y0 + 1,
          Math.ceil(((y + 1) * middleHeight) / target.height),
        );
      if (protectedCells.has(ti)) {
        // Protected cells bypass smoothing and retain local contrast from the source crop.
        samples.push(
          areaSample(
            input,
            (x * input.width) / target.width,
            (y * input.height) / target.height,
            ((x + 1) * input.width) / target.width,
            ((y + 1) * input.height) / target.height,
          ),
        );
      } else if (input.settings.sampling === "contrast") {
        samples.push(
          contrastFromMiddle(
            smoothed,
            x0,
            y0,
            x1,
            y1,
            middleWidth,
            middleHeight,
          ),
        );
      } else {
        let l = 0,
          a = 0,
          b = 0,
          count = 0;
        for (let my = y0; my < y1; my++)
          for (let mx = x0; mx < x1; mx++) {
            const sample = smoothed[my * middleWidth + mx];
            if (!sample.empty) {
              l += sample.lab.l;
              a += sample.lab.a;
              b += sample.lab.b;
              count++;
            }
          }
        samples.push(
          count
            ? {
                lab: { l: l / count, a: a / count, b: b / count },
                empty: false,
              }
            : emptySample(),
        );
      }
    }
  return {
    width: target.width,
    height: target.height,
    samples,
    protectedCells,
    regionByCell,
  };
}
