import { convertWithPaletteRefinement } from "../../src/core/convert";
import { ciede2000 } from "../../src/core/ciede2000";
import type { Lab } from "../../src/core/color";
import type { ConvertInput } from "../../src/model";

type Weighted = { lab: Lab; weight: number };
export interface Refinement {
  allowed: number[];
  before: number;
  after: number;
  swapped: { removed: number; added: number } | null;
}

export function refinePaletteOnce(
  points: Weighted[],
  labs: Lab[],
  initial: number[],
): Refinement {
  const unchanged = {
    allowed: [...initial],
    before: 0,
    after: 0,
    swapped: null,
  };
  if (!points.length || !initial.length) return unchanged;
  if (
    new Set(initial).size !== initial.length ||
    initial.some((i) => !Number.isInteger(i) || i < 0 || i >= labs.length)
  ) {
    throw new Error("Invalid initial palette indices");
  }
  const distances = points.map((p) =>
    Float64Array.from(labs, (lab) => ciede2000(p.lab, lab)),
  );
  const closest = points.map((p, row) => {
    const d = distances[row];
    let best = Infinity,
      second = Infinity,
      owner = -1;
    for (const i of initial) {
      if (d[i] < best) {
        second = best;
        best = d[i];
        owner = i;
      } else if (d[i] < second) second = d[i];
    }
    return { best, second, owner, weight: p.weight };
  });
  const before = closest.reduce((sum, p) => sum + p.best * p.weight, 0);
  let bestGain = 1e-9;
  let swap: Refinement["swapped"] = null;
  for (let candidate = 0; candidate < labs.length; candidate++) {
    if (initial.includes(candidate)) continue;
    for (const removed of initial) {
      let gain = 0;
      for (let row = 0; row < points.length; row++) {
        const p = closest[row];
        const remaining = p.owner === removed ? p.second : p.best;
        gain +=
          (p.best - Math.min(remaining, distances[row][candidate])) * p.weight;
      }
      if (gain > bestGain) {
        bestGain = gain;
        swap = { removed, added: candidate };
      }
    }
  }
  const allowed = swap
    ? initial.map((i) => (i === swap.removed ? swap.added : i))
    : [...initial];
  const after = swap
    ? points.reduce(
        (sum, p, row) =>
          sum + Math.min(...allowed.map((i) => distances[row][i])) * p.weight,
        0,
      )
    : before;
  if (after >= before - 1e-9)
    return { allowed: [...initial], before, after: before, swapped: null };
  return { allowed, before, after, swapped: swap };
}

export function convertPaletteCandidate(input: ConvertInput) {
  if (input.settings.dithering || input.settings.cleanup || input.constraints) {
    throw new Error(
      "Research comparison requires dithering, cleanup and constraints disabled",
    );
  }
  if (input.settings.algorithm === "region") {
    throw new Error("Palette research only refines the baseline path");
  }
  let refinement: Refinement = {
    allowed: [],
    before: 0,
    after: 0,
    swapped: null,
  };
  const pattern = convertWithPaletteRefinement(
    input,
    (points, labs, allowed) => {
      refinement = refinePaletteOnce(points, labs, allowed);
      return refinement.allowed;
    },
  );
  pattern.algorithmVersion = "baseline-palette-one-swap-research-v1";
  return { pattern, refinement };
}
