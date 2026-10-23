import { describe, it, expect } from "vitest";
import { parseProject } from "../src/export";
import { defaultSettings, geometryKey, type Project } from "../src/model";
import { defaultPalette } from "../src/palettes";
const fixture = (): Project => ({
  schemaVersion: 1,
  id: "region",
  title: "区域约束",
  source: null,
  settings: { ...defaultSettings, algorithm: "region" },
  pattern: {
    width: 2,
    height: 2,
    cells: [0, 1, 2, 3],
    palette: defaultPalette,
    settings: { ...defaultSettings, algorithm: "region" },
    algorithmVersion: "region-v2",
    durationMs: 0,
  },
  edited: false,
  updatedAt: new Date().toISOString(),
  constraints: {
    width: 2,
    height: 2,
    geometryKey: geometryKey(defaultSettings),
    protectedCells: [0],
    regions: [{ id: "a", indices: [1, 2], colors: [1, 2] }],
  },
});
describe("region project compatibility", () => {
  it("roundtrips constraints and generated constraints", () => {
    const p = fixture();
    p.generatedConstraints = structuredClone(p.constraints);
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it("keeps legacy files without algorithm settings readable", () => {
    const p = fixture();
    delete p.settings.algorithm;
    delete p.pattern!.settings.algorithm;
    delete p.constraints;
    expect(parseProject(JSON.stringify(p)).pattern!.algorithmVersion).toBe(
      "region-v2",
    );
  });
  it("rejects overlapping region constraints", () => {
    const p = fixture();
    p.constraints!.regions.push({ id: "b", indices: [2, 3], colors: [3] });
    expect(() => parseProject(JSON.stringify(p))).toThrow("重叠");
  });
  it("rejects out of range mask indices", () => {
    const p = fixture();
    p.constraints!.protectedCells = [4];
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it("rejects invalid locked palette indices", () => {
    const p = fixture();
    p.constraints!.regions[0].colors = [999];
    expect(() => parseProject(JSON.stringify(p))).toThrow("无效色号");
  });
  it("rejects masks with mismatched dimensions", () => {
    const p = fixture();
    p.constraints!.width = 1;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
});
