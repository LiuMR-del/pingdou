import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { convert, convertBaseline } from "../src/core/convert";
import frozen from "./fixtures/baseline-v1.json";
import { gradientTexture, legacyBaselineInput } from "./fixtures/conversion";

it("preserves baseline results for legacy settings without algorithm flag", () => {
  const input = legacyBaselineInput();
  const before = convertBaseline(input);
  expect(convert(input)).toEqual(before);
  expect(before.algorithmVersion).toBe("linear-area-lab-kmeans12-ciede2000-v1");
  expect(new Set(before.cells).size).toBeLessThanOrEqual(8);
});

it.each(frozen)(
  "keeps the frozen v1 matrix at $longSide cells and $maxColors colors",
  (record) => {
    const input =
      record.longSide === 16 ? legacyBaselineInput() : gradientTexture();
    input.settings = {
      ...input.settings,
      longSide: record.longSide,
      maxColors: record.maxColors,
    };
    const result = convertBaseline(input);
    expect([result.width, result.height]).toEqual([
      record.width,
      record.height,
    ]);
    expect(
      createHash("sha256").update(JSON.stringify(result.cells)).digest("hex"),
    ).toBe(record.hash);
  },
);
