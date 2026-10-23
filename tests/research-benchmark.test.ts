import { it, expect } from "vitest";
import { convert } from "../src/core/convert";
import { EMPTY } from "../src/model";
import { countSmallComponents } from "../src/core/region";
import { writeFileSync, mkdirSync } from "node:fs";
import { gradientTexture } from "./fixtures/conversion";
it("reports same-input baseline and experimental texture/feature metrics without assuming winner", () => {
  const input = gradientTexture();
  const start = performance.now();
  const baseline = convert(input);
  const baselineMs = performance.now() - start;
  const next = performance.now();
  const candidate = convert({
    ...input,
    settings: {
      ...input.settings,
      algorithm: "region",
      smoothing: 1,
      spatialStrength: 2,
      sampling: "area",
    },
  });
  const regionMs = performance.now() - next;
  const eyeIndices = [16 * 48 + 16, 16 * 48 + 31];
  const dark = (p: typeof baseline) =>
    eyeIndices.filter((i) => {
      const c = p.cells[i];
      if (c === EMPTY) return false;
      const hex = p.palette.colors[c].hex;
      return parseInt(hex.slice(1, 3), 16) < 100;
    }).length;
  const record = {
    baselineSmallComponents: countSmallComponents(
      baseline.cells,
      baseline.width,
      baseline.height,
    ),
    regionSmallComponents: countSmallComponents(
      candidate.cells,
      candidate.width,
      candidate.height,
    ),
    baseline,
    candidate,
  };
  if (process.env.WRITE_RESEARCH === "1") {
    mkdirSync("docs/assets/algorithm/ts-experiment", { recursive: true });
    writeFileSync(
      "docs/assets/algorithm/ts-experiment/results.json",
      JSON.stringify(record, null, 2),
    );
  }
  console.log(
    JSON.stringify({
      baselineSmallComponents: record.baselineSmallComponents,
      regionSmallComponents: record.regionSmallComponents,
      sample: "selfmade-gradient-face-texture",
      grid: "48x48",
      colors: 12,
      baselineMs,
      regionMs,
      baselineEyes: dark(baseline),
      regionEyes: dark(candidate),
      diagnostics: candidate.diagnostics,
    }),
  );
  expect(candidate.width).toBe(baseline.width);
  expect(candidate.height).toBe(baseline.height);
  expect(
    new Set(candidate.cells.filter((c) => c !== EMPTY)).size,
  ).toBeLessThanOrEqual(12);
  expect(
    candidate.diagnostics?.energy.every(
      (v, i, a) => !i || v <= a[i - 1] + 1e-8,
    ),
  ).toBe(true);
});
