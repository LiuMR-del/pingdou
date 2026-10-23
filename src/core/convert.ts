import { dimensions, EMPTY, type ConvertInput, type Pattern } from "../model";
import { ciede2000 } from "./ciede2000";
import {
  hexToRgb,
  labDistanceSquared,
  paletteLabs,
  rgbToLab,
  srgbToLinear,
  linearToSrgb,
  type Lab,
} from "./color";
import { convertRegion } from "./region";
const ALGORITHM = "linear-area-lab-kmeans12-ciede2000-v1";
type Sample = { lab: Lab; empty: boolean };
type Weighted = { lab: Lab; weight: number };
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

function sample(
  input: ConvertInput,
  outWidth: number,
  outHeight: number,
): Sample[] {
  const { pixels, width, height, settings } = input;
  const background = hexToRgb(settings.background).map((v) =>
    srgbToLinear(v / 255),
  );
  const table = Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));
  const result: Sample[] = [];
  function finish(
    r: number,
    g: number,
    b: number,
    a: number,
    weight: number,
  ): Sample {
    if ((a / weight) * 255 < settings.alphaThreshold || a === 0)
      return { lab: { l: 0, a: 0, b: 0 }, empty: true };
    return {
      lab: rgbToLab(
        linearToSrgb(r / weight) * 255,
        linearToSrgb(g / weight) * 255,
        linearToSrgb(b / weight) * 255,
      ),
      empty: false,
    };
  }
  for (let oy = 0; oy < outHeight; oy++)
    for (let ox = 0; ox < outWidth; ox++) {
      if (settings.mode === "pixel") {
        const sx = Math.min(
            width - 1,
            Math.floor(((ox + 0.5) * width) / outWidth),
          ),
          sy = Math.min(
            height - 1,
            Math.floor(((oy + 0.5) * height) / outHeight),
          );
        const i = (sy * width + sx) * 4,
          a = pixels[i + 3] / 255;
        result.push(
          finish(
            table[pixels[i]] * a + background[0] * (1 - a),
            table[pixels[i + 1]] * a + background[1] * (1 - a),
            table[pixels[i + 2]] * a + background[2] * (1 - a),
            a,
            1,
          ),
        );
        continue;
      }
      const left = (ox * width) / outWidth,
        right = ((ox + 1) * width) / outWidth,
        top = (oy * height) / outHeight,
        bottom = ((oy + 1) * height) / outHeight;
      let r = 0,
        g = 0,
        b = 0,
        aSum = 0,
        weight = 0;
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++)
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const w =
            (Math.min(right, sx + 1) - Math.max(left, sx)) *
            (Math.min(bottom, sy + 1) - Math.max(top, sy));
          const i =
              (Math.min(height - 1, sy) * width + Math.min(width - 1, sx)) * 4,
            a = pixels[i + 3] / 255;
          r += (table[pixels[i]] * a + background[0] * (1 - a)) * w;
          g += (table[pixels[i + 1]] * a + background[1] * (1 - a)) * w;
          b += (table[pixels[i + 2]] * a + background[2] * (1 - a)) * w;
          aSum += a * w;
          weight += w;
        }
      result.push(finish(r, g, b, aSum, weight));
    }
  return result;
}
function histogram(samples: Sample[]): Weighted[] {
  const bins = new Map<
    string,
    { l: number; a: number; b: number; weight: number }
  >();
  for (const s of samples) {
    if (s.empty) continue;
    const key = `${Math.round(s.lab.l / 4)},${Math.round(s.lab.a / 6)},${Math.round(s.lab.b / 6)}`;
    const v = bins.get(key);
    if (v) {
      v.l += s.lab.l;
      v.a += s.lab.a;
      v.b += s.lab.b;
      v.weight++;
    } else bins.set(key, { ...s.lab, weight: 1 });
  }
  const points = [...bins.values()].map((v) => ({
    lab: { l: v.l / v.weight, a: v.a / v.weight, b: v.b / v.weight },
    weight: v.weight,
  }));
  if (points.length <= 2048) return points;
  const merged = new Map<
    string,
    { l: number; a: number; b: number; weight: number }
  >();
  for (const p of points) {
    const k = `${Math.round(p.lab.l / 10)},${Math.round(p.lab.a / 12)},${Math.round(p.lab.b / 12)}`;
    const v = merged.get(k);
    if (v) {
      v.l += p.lab.l * p.weight;
      v.a += p.lab.a * p.weight;
      v.b += p.lab.b * p.weight;
      v.weight += p.weight;
    } else
      merged.set(k, {
        l: p.lab.l * p.weight,
        a: p.lab.a * p.weight,
        b: p.lab.b * p.weight,
        weight: p.weight,
      });
  }
  return [...merged.values()].map((v) => ({
    lab: { l: v.l / v.weight, a: v.a / v.weight, b: v.b / v.weight },
    weight: v.weight,
  }));
}
function nearest(
  lab: Lab,
  labs: Lab[],
  allowed: number[],
  delta = (a: Lab, b: Lab) => labDistanceSquared(a, b),
) {
  let best = allowed[0],
    distance = Infinity;
  for (const i of allowed) {
    const d = delta(lab, labs[i]);
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}
function cluster(points: Weighted[], budget: number): Lab[] {
  if (!points.length) return [];
  const k = Math.min(budget, points.length),
    first = points.reduce((a, b) => (b.weight > a.weight ? b : a));
  const centers: Lab[] = [{ ...first.lab }];
  while (centers.length < k) {
    let chosen = points[0],
      score = -1;
    for (const p of points) {
      const d =
        Math.min(...centers.map((c) => labDistanceSquared(p.lab, c))) *
        p.weight;
      if (d > score) {
        score = d;
        chosen = p;
      }
    }
    if (score <= 1e-10) break;
    centers.push({ ...chosen.lab });
  }
  for (let round = 0; round < 12; round++) {
    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, w: 0 })),
      ids = centers.map((_, i) => i);
    for (const p of points) {
      const v = sums[nearest(p.lab, centers, ids)];
      v.l += p.lab.l * p.weight;
      v.a += p.lab.a * p.weight;
      v.b += p.lab.b * p.weight;
      v.w += p.weight;
    }
    let movement = 0;
    for (let i = 0; i < centers.length; i++) {
      const s = sums[i];
      if (!s.w) continue;
      const n = { l: s.l / s.w, a: s.a / s.w, b: s.b / s.w };
      movement += labDistanceSquared(n, centers[i]);
      centers[i] = n;
    }
    if (movement < 0.001) break;
  }
  return centers;
}
function clean(cells: number[], width: number, height: number, labs: Lab[]) {
  const changes: [number, number][] = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        c = cells[i];
      if (c === EMPTY) continue;
      const neighbors = [
          cells[i - width],
          cells[i - 1],
          cells[i + 1],
          cells[i + width],
        ],
        counts = new Map<number, number>();
      for (const v of neighbors)
        if (v !== EMPTY) counts.set(v, (counts.get(v) ?? 0) + 1);
      for (const [v, n] of counts)
        if (v !== c && n >= 3 && ciede2000(labs[c], labs[v]) <= 12) {
          changes.push([i, v]);
          break;
        }
    }
  for (const [i, v] of changes) cells[i] = v;
}

/** The unchanged v1 conversion path. Keep this implementation stable for baseline projects. */
export function convertBaseline(input: ConvertInput): Pattern {
  return convertWithPaletteRefinement(input);
}

export function convertWithPaletteRefinement(
  input: ConvertInput,
  refine?: (points: Weighted[], labs: Lab[], allowed: number[]) => number[],
): Pattern {
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width < 1 ||
    input.height < 1 ||
    input.width * input.height > 40_000_000 ||
    input.pixels.length !== input.width * input.height * 4
  )
    throw new Error("图片数据无效或超过处理上限");
  if (
    !Number.isInteger(input.settings.longSide) ||
    input.settings.longSide < 1 ||
    input.settings.longSide > 128 ||
    !Number.isInteger(input.settings.maxColors) ||
    input.settings.maxColors < 1 ||
    input.settings.maxColors > 32
  )
    throw new Error("格数或颜色上限不合法");
  if (!input.palette.colors.length || input.palette.colors.length > 512)
    throw new Error("色卡数据无效");
  const { width, height } = dimensions(
      input.width,
      input.height,
      input.settings.longSide,
    ),
    samples = sample(input, width, height),
    points = histogram(samples),
    labs = paletteLabs(input.palette),
    all = labs.map((_, i) => i),
    budget = Math.min(input.settings.maxColors, labs.length);
  const centers = cluster(points, budget);
  let allowed = [
    ...new Set(centers.map((c) => nearest(c, labs, all, ciede2000))),
  ];
  while (allowed.length < Math.min(centers.length, budget)) {
    let next = -1,
      best = 0;
    for (const p of points) {
      const target = nearest(p.lab, labs, all, ciede2000);
      if (allowed.includes(target)) continue;
      const current = nearest(p.lab, labs, allowed, ciede2000),
        score =
          (ciede2000(p.lab, labs[current]) - ciede2000(p.lab, labs[target])) *
          p.weight;
      if (score > best) {
        best = score;
        next = target;
      }
    }
    if (next < 0) break;
    allowed.push(next);
  }
  if (refine) allowed = refine(points, labs, allowed);
  const cells = new Uint16Array(width * height);
  cells.fill(EMPTY);
  if (allowed.length) {
    const errors = input.settings.dithering
      ? Array.from({ length: samples.length }, () => ({ l: 0, a: 0, b: 0 }))
      : null;
    const cache = new Map<string, number>();
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].empty) continue;
      const base = samples[i].lab,
        e = errors?.[i],
        lab = e
          ? { l: clamp(base.l + e.l, 0, 100), a: base.a + e.a, b: base.b + e.b }
          : base,
        key = `${lab.l.toFixed(4)},${lab.a.toFixed(4)},${lab.b.toFixed(4)}`;
      let v = cache.get(key);
      if (v === undefined) {
        v = nearest(lab, labs, allowed, ciede2000);
        cache.set(key, v);
      }
      cells[i] = v;
      if (errors) {
        const x = i % width,
          y = Math.floor(i / width),
          diff = {
            l: lab.l - labs[v].l,
            a: lab.a - labs[v].a,
            b: lab.b - labs[v].b,
          };
        for (const [dx, dy, w] of [
          [1, 0, 7 / 16],
          [-1, 1, 3 / 16],
          [0, 1, 5 / 16],
          [1, 1, 1 / 16],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            j = ny * width + nx;
          if (nx >= 0 && nx < width && ny < height && !samples[j].empty) {
            errors[j].l += diff.l * w;
            errors[j].a += diff.a * w;
            errors[j].b += diff.b * w;
          }
        }
      }
    }
  }
  const output = Array.from(cells);
  if (input.settings.cleanup) clean(output, width, height, labs);
  return {
    width,
    height,
    cells: output,
    palette: input.palette,
    settings: { ...input.settings },
    algorithmVersion: ALGORITHM,
    durationMs: 0,
  };
}

/** Dispatches to the legacy baseline or the constraint-aware region converter. */
export function convert(input: ConvertInput): Pattern {
  return input.settings.algorithm === "region"
    ? convertRegion(input)
    : convertBaseline(input);
}
