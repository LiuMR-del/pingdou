import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { convertBaseline } from "../src/core/convert";
import { paletteLabs } from "../src/core/color";
import { countSmallComponents } from "../src/core/region";
import {
  defaultSettings,
  EMPTY,
  type Pattern,
  type ConvertInput,
} from "../src/model";
import { defaultPalette } from "../src/palettes";
import { convertPaletteCandidate } from "../scripts/research/palette-refinement";
import { gradientTexture } from "./fixtures/conversion";

type Rect = [number, number, number, number];
const specs: Record<
  string,
  { eyes: Rect[]; mouth: Rect; texture: Rect; face: Rect }
> = {
  gradient: {
    eyes: [
      [30 / 96, 30 / 96, 36 / 96, 38 / 96],
      [60 / 96, 30 / 96, 66 / 96, 38 / 96],
    ],
    mouth: [40 / 96, 43 / 96, 56 / 96, 46 / 96],
    texture: [24 / 96, 58 / 96, 72 / 96, 92 / 96],
    face: [20 / 96, 14 / 96, 76 / 96, 28 / 96],
  },
  texture: {
    eyes: [
      [98 / 256, 82 / 256, 111 / 256, 95 / 256],
      [146 / 256, 82 / 256, 159 / 256, 95 / 256],
    ],
    mouth: [112 / 256, 117 / 256, 145 / 256, 127 / 256],
    texture: [169 / 256, 172 / 256, 197 / 256, 230 / 256],
    face: [90 / 256, 63 / 256, 168 / 256, 78 / 256],
  },
  "cat-redrawn": {
    eyes: [
      [144 / 400, 185 / 400, 169 / 400, 219 / 400],
      [232 / 400, 185 / 400, 257 / 400, 219 / 400],
    ],
    mouth: [176 / 400, 247 / 400, 224 / 400, 269 / 400],
    texture: [120 / 400, 322 / 400, 280 / 400, 344 / 400],
    face: [152 / 400, 132 / 400, 248 / 400, 174 / 400],
  },
};
function cellsIn(p: Pattern, rect: Rect) {
  const ids: number[] = [];
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const u = (x + 0.5) / p.width,
        v = (y + 0.5) / p.height;
      if (u >= rect[0] && u < rect[2] && v >= rect[1] && v < rect[3])
        ids.push(y * p.width + x);
    }
  return ids;
}
function metrics(p: Pattern, name: string) {
  const labs = paletteLabs(p.palette),
    spec = specs[name];
  const feature = (rect: Rect) => {
    const ids = cellsIn(p, rect).filter((i) => p.cells[i] !== EMPTY);
    const ls = ids.map((i) => labs[p.cells[i]].l);
    const face = cellsIn(p, spec.face).map((i) => labs[p.cells[i]].l);
    return {
      cells: ids.length,
      darkCells: ls.filter((l) => l < 50).length,
      meanLightness: ls.length
        ? ls.reduce((a, b) => a + b, 0) / ls.length
        : null,
      darkestContrast:
        ls.length && face.length
          ? face.reduce((a, b) => a + b, 0) / face.length - Math.min(...ls)
          : null,
    };
  };
  const textureIds = new Set(cellsIn(p, spec.texture));
  const textureCells = p.cells.map((c, i) => (textureIds.has(i) ? c : EMPTY));
  return {
    eyes: spec.eyes.map(feature),
    mouth: feature(spec.mouth),
    textureSmallComponents: countSmallComponents(
      textureCells,
      p.width,
      p.height,
    ),
    textureColors: new Set(
      [...textureIds].map((i) => p.cells[i]).filter((c) => c !== EMPTY),
    ).size,
    smallComponents: countSmallComponents(p.cells, p.width, p.height),
  };
}
function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

it.skipIf(process.env.RUN_PALETTE_RESEARCH !== "1")(
  "records isolated single-swap comparison without treating objective reduction as visual acceptance",
  () => {
    const dir = new URL(
      "../docs/assets/algorithm/palette-one-swap/",
      import.meta.url,
    );
    const metadata = JSON.parse(
      readFileSync(new URL("inputs.json", dir), "utf8"),
    );
    const inputs: Record<string, ConvertInput> = {
      gradient: gradientTexture(),
    };
    for (const name of ["texture", "cat-redrawn"]) {
      const m = metadata[name];
      inputs[name] = {
        width: m.width,
        height: m.height,
        pixels: Uint8ClampedArray.from(
          readFileSync(new URL(`${name}.rgba`, dir)),
        ),
        settings: { ...defaultSettings },
        palette: defaultPalette,
      };
    }
    const cases = [];
    for (const [name, source] of Object.entries(inputs)) {
      writeFileSync(new URL(`${name}.rgba`, dir), source.pixels);
      for (const grid of [32, 48, 64])
        for (const budget of [8, 16]) {
          const input = {
            ...source,
            settings: {
              ...source.settings,
              longSide: grid,
              maxColors: budget,
              dithering: false,
              cleanup: false,
              algorithm: "baseline" as const,
            },
          };
          convertBaseline(input);
          convertPaletteCandidate(input);
          const bt: number[] = [],
            ct: number[] = [];
          for (let n = 0; n < 7; n++) {
            const runB = () => {
              const start = performance.now();
              convertBaseline(input);
              bt.push(performance.now() - start);
            };
            const runC = () => {
              const start = performance.now();
              convertPaletteCandidate(input);
              ct.push(performance.now() - start);
            };
            if (n % 2) {
              runC();
              runB();
            } else {
              runB();
              runC();
            }
          }
          const baseline = convertBaseline(input),
            candidate = convertPaletteCandidate(input);
          expect(candidate.refinement.after).toBeLessThanOrEqual(
            candidate.refinement.before + 1e-9,
          );
          expect(
            new Set(candidate.pattern.cells.filter((i) => i !== EMPTY)).size,
          ).toBeLessThanOrEqual(budget);
          expect(candidate.pattern.cells.map((c) => c === EMPTY)).toEqual(
            baseline.cells.map((c) => c === EMPTY),
          );
          cases.push({
            sample: name,
            sourceWidth: source.width,
            sourceHeight: source.height,
            grid,
            budget,
            baseline: {
              pattern: baseline,
              metrics: metrics(baseline, name),
              medianMs: median(bt),
            },
            candidate: {
              pattern: candidate.pattern,
              metrics: metrics(candidate.pattern, name),
              medianMs: median(ct),
            },
            refinement: candidate.refinement,
            changedCells: baseline.cells.filter(
              (c, i) => c !== candidate.pattern.cells[i],
            ).length,
          });
        }
    }
    const report = {
      scope:
        "project-authored synthetic samples only; not real-photo acceptance",
      timing: "7 warmed alternating runs per case; local Node, not mobile",
      palette: defaultPalette,
      cases,
    };
    writeFileSync(
      new URL("results.json", dir),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        cases.map((r) => ({
          sample: r.sample,
          grid: r.grid,
          colors: r.budget,
          changed: r.changedCells,
          swap: r.refinement.swapped,
          objectiveReduction: r.refinement.before - r.refinement.after,
          baselineMs: r.baseline.medianMs,
          candidateMs: r.candidate.medianMs,
          texture: [
            r.baseline.metrics.textureSmallComponents,
            r.candidate.metrics.textureSmallComponents,
          ],
          eyeDark: [
            r.baseline.metrics.eyes.map((e) => e.darkCells),
            r.candidate.metrics.eyes.map((e) => e.darkCells),
          ],
          mouthDark: [
            r.baseline.metrics.mouth.darkCells,
            r.candidate.metrics.mouth.darkCells,
          ],
        })),
        null,
        2,
      ),
    );
  },
  120000,
);
