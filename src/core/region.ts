import {
  EMPTY,
  dimensions,
  geometryKey,
  type ConvertInput,
  type Pattern,
  type RegionConstraints,
} from "../model";
import { ciede2000 } from "./ciede2000";
import { paletteLabs, type Lab } from "./color";
import { preprocessRegion, type RegionSample } from "./preprocess";

const ALGORITHM = "region-ciede2000-icm6-experimental";
const MAX_ROUNDS = 6;

type Diagnostics = NonNullable<Pattern["diagnostics"]>;

function validateInput(
  input: ConvertInput,
  constraints: RegionConstraints,
): void {
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
  if (input.settings.dithering) throw new Error("region算法不支持抖动");
  const target = dimensions(input.width, input.height, input.settings.longSide);
  if (
    constraints.width !== target.width ||
    constraints.height !== target.height
  )
    throw new Error("区域约束尺寸与输出图纸不一致");
  if (constraints.geometryKey !== geometryKey(input.settings))
    throw new Error("区域约束已过期，请重新生成");
}

function distance(sample: RegionSample, palette: Lab[], index: number): number {
  return sample.empty ? 0 : ciede2000(sample.lab, palette[index]);
}

function candidateColors(
  samples: RegionSample[],
  labs: Lab[],
  locked: number[],
  budget: number,
): number[] {
  const selected = [...new Set(locked)].sort((a, b) => a - b);
  const all = labs.map((_, i) => i);
  const distances = samples.map((sample) =>
    labs.map((_, color) => distance(sample, labs, color)),
  );
  if (!selected.length && all.length) {
    let first = all[0],
      firstScore = Infinity;
    for (const color of all) {
      const score = distances.reduce((sum, row) => sum + row[color], 0);
      if (score < firstScore || (score === firstScore && color < first)) {
        first = color;
        firstScore = score;
      }
    }
    selected.push(first);
  }
  while (selected.length < budget) {
    let best = -1,
      bestGain = -Infinity;
    for (const color of all) {
      if (selected.includes(color)) continue;
      let gain = 0;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i].empty) continue;
        const current = selected.length
          ? Math.min(...selected.map((existing) => distances[i][existing]))
          : Math.min(...distances[i]);
        gain += Math.max(0, current - distances[i][color]);
      }
      if (gain > bestGain || (gain === bestGain && color < best)) {
        bestGain = gain;
        best = color;
      }
    }
    if (best < 0) break;
    selected.push(best);
  }
  return selected;
}

function componentCount(
  cells: number[],
  width: number,
  height: number,
  minSize = 1,
): number {
  const seen = new Uint8Array(cells.length);
  let count = 0;
  for (let start = 0; start < cells.length; start++) {
    if (seen[start] || cells[start] === EMPTY) continue;
    const color = cells[start];
    const queue = [start];
    seen[start] = 1;
    let size = 0;
    while (queue.length) {
      const current = queue.pop()!;
      size++;
      const x = current % width,
        y = Math.floor(current / width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!seen[next] && cells[next] === color) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (size <= minSize) count++;
  }
  return count;
}

/** Counts monochrome components of size <= minSize, exported for measurable region diagnostics/tests. */
export function countSmallComponents(
  cells: number[],
  width: number,
  height: number,
  minSize = 3,
): number {
  if (cells.length !== width * height) throw new Error("连通块输入尺寸无效");
  return componentCount(cells, width, height, minSize);
}

function allowedForCell(
  index: number,
  constraints: RegionConstraints,
  candidates: number[],
): number[] {
  for (const region of constraints.regions)
    if (region.indices.includes(index)) return [...new Set(region.colors)];
  return candidates;
}

function initialCells(
  samples: RegionSample[],
  constraints: RegionConstraints,
  candidates: number[],
  labs: Lab[],
): number[] {
  return samples.map((sample, index) => {
    if (sample.empty) return EMPTY;
    const allowed = allowedForCell(index, constraints, candidates);
    if (!allowed.length) return EMPTY;
    let best = allowed[0],
      error = distance(sample, labs, best);
    for (const color of allowed.slice(1)) {
      const next = distance(sample, labs, color);
      if (next < error || (next === error && color < best)) {
        best = color;
        error = next;
      }
    }
    return best;
  });
}

function edgeBase(settings: ConvertInput["settings"]): number {
  return settings.spatialStrength ?? 1;
}

function canPair(
  index: number,
  neighbour: number,
  cells: number[],
  regionByCell: Int32Array,
  protectedCells: Set<number>,
): boolean {
  if (protectedCells.has(index) || protectedCells.has(neighbour)) return false;
  if (cells[index] === EMPTY || cells[neighbour] === EMPTY) return false;
  return regionByCell[index] === regionByCell[neighbour];
}

function pairPenalty(
  index: number,
  neighbour: number,
  samples: RegionSample[],
  settings: ConvertInput["settings"],
): number {
  const base = edgeBase(settings);
  if (base === 0) return 0;
  const difference = ciede2000(samples[index].lab, samples[neighbour].lab);
  // A weak optional outline preserves strong source boundaries by reducing cross-edge smoothing.
  const outlineFactor = settings.outline ? Math.exp(-difference / 18) : 1;
  return base * Math.exp(-difference / 42) * outlineFactor;
}

function cellEnergy(
  index: number,
  color: number,
  cells: number[],
  samples: RegionSample[],
  labs: Lab[],
  regionByCell: Int32Array,
  protectedCells: Set<number>,
  width: number,
  height: number,
  settings: ConvertInput["settings"],
): number {
  let energy = distance(samples[index], labs, color);
  if (edgeBase(settings) === 0 || color === EMPTY) return energy;
  const x = index % width,
    y = Math.floor(index / width);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const ni = ny * width + nx;
    if (!canPair(index, ni, cells, regionByCell, protectedCells)) continue;
    if (cells[ni] !== color)
      energy += pairPenalty(index, ni, samples, settings);
  }
  return energy;
}

function totalEnergy(
  cells: number[],
  samples: RegionSample[],
  labs: Lab[],
  regionByCell: Int32Array,
  protectedCells: Set<number>,
  width: number,
  height: number,
  settings: ConvertInput["settings"],
): number {
  let energy = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (cells[index] === EMPTY) continue;
      energy += distance(samples[index], labs, cells[index]);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= width || ny >= height) continue;
        const neighbour = ny * width + nx;
        if (
          canPair(index, neighbour, cells, regionByCell, protectedCells) &&
          cells[index] !== cells[neighbour]
        )
          energy += pairPenalty(index, neighbour, samples, settings);
      }
    }
  return energy;
}

function runIcm(
  cells: number[],
  samples: RegionSample[],
  constraints: RegionConstraints,
  candidates: number[],
  labs: Lab[],
  protectedCells: Set<number>,
  regionByCell: Int32Array,
  width: number,
  height: number,
  settings: ConvertInput["settings"],
): number[] {
  const energy: number[] = [
    totalEnergy(
      cells,
      samples,
      labs,
      regionByCell,
      protectedCells,
      width,
      height,
      settings,
    ),
  ];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const before = [...cells];
    const previous = energy[energy.length - 1];
    for (let index = 0; index < cells.length; index++) {
      if (protectedCells.has(index) || samples[index].empty) continue;
      const allowed = allowedForCell(index, constraints, candidates);
      if (!allowed.length) continue;
      let best = cells[index],
        bestEnergy = cellEnergy(
          index,
          best,
          cells,
          samples,
          labs,
          regionByCell,
          protectedCells,
          width,
          height,
          settings,
        );
      for (const candidate of allowed) {
        const candidateEnergy = cellEnergy(
          index,
          candidate,
          cells,
          samples,
          labs,
          regionByCell,
          protectedCells,
          width,
          height,
          settings,
        );
        if (
          candidateEnergy < bestEnergy ||
          (candidateEnergy === bestEnergy && candidate < best)
        ) {
          best = candidate;
          bestEnergy = candidateEnergy;
        }
      }
      cells[index] = best;
    }
    const next = totalEnergy(
      cells,
      samples,
      labs,
      regionByCell,
      protectedCells,
      width,
      height,
      settings,
    );
    if (next <= previous + 1e-9) energy.push(next);
    else {
      cells.splice(0, cells.length, ...before);
      energy.push(previous);
      break;
    }
    if (Math.abs(next - previous) <= 1e-9) break;
  }
  return energy;
}

export function convertRegion(input: ConvertInput): Pattern {
  const target = dimensions(input.width, input.height, input.settings.longSide);
  const constraints = input.constraints ?? {
    width: target.width,
    height: target.height,
    geometryKey: geometryKey(input.settings),
    protectedCells: [],
    regions: [],
  };
  validateInput(input, constraints);
  const protectedSet = new Set(constraints.protectedCells);
  if (
    constraints.regions.some((r) => r.indices.some((i) => protectedSet.has(i)))
  )
    throw new Error("保护格与锁色区域重叠，请先从选区排除保护细节");
  const prepared = preprocessRegion(input, constraints);
  const labs = paletteLabs(input.palette);
  const locked = [
    ...new Set(constraints.regions.flatMap((region) => region.colors)),
  ].sort((a, b) => a - b);
  if (locked.some((color) => color < 0 || color >= labs.length))
    throw new Error("区域锁色含无效色号");
  if (locked.length > input.settings.maxColors)
    throw new Error("区域锁色数量超过颜色预算");
  const protectedColors = [
    ...new Set(
      [...prepared.protectedCells]
        .filter((i) => !prepared.samples[i].empty)
        .map((i) => {
          let best = 0,
            error = Infinity;
          for (let c = 0; c < labs.length; c++) {
            const d = distance(prepared.samples[i], labs, c);
            if (d < error) {
              best = c;
              error = d;
            }
          }
          return best;
        }),
    ),
  ];
  const required = [...new Set([...locked, ...protectedColors])];
  if (required.length > input.settings.maxColors)
    throw new Error("保护细节及锁色超过颜色预算，请提高颜色上限或减少保护区");
  const candidates = candidateColors(
    prepared.samples,
    labs,
    required,
    Math.min(input.settings.maxColors, labs.length),
  );
  const cells = initialCells(prepared.samples, constraints, candidates, labs);
  const before = countSmallComponents(cells, prepared.width, prepared.height);
  const effectiveSettings =
    input.settings.mode === "pixel"
      ? { ...input.settings, spatialStrength: 0 as const }
      : input.settings;
  const energy = runIcm(
    cells,
    prepared.samples,
    constraints,
    candidates,
    labs,
    prepared.protectedCells,
    prepared.regionByCell,
    prepared.width,
    prepared.height,
    effectiveSettings,
  );
  const after = countSmallComponents(cells, prepared.width, prepared.height);
  const diagnostics: Diagnostics = {
    energy,
    smallComponentsBefore: before,
    smallComponentsAfter: after,
  };
  return {
    width: prepared.width,
    height: prepared.height,
    cells,
    palette: input.palette,
    settings: { ...input.settings },
    algorithmVersion: ALGORITHM,
    durationMs: 0,
    diagnostics,
  };
}
